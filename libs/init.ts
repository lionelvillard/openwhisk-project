/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { getLogger } from 'log4js';
import * as fs from 'fs-extra';
import * as yaml from 'yamljs';
import * as path from 'path';
import { IConfig, IWskProps } from './types';
import * as plugins from './pluginmgr';
import * as expandHome from 'expand-home-dir';
import * as utils from './utils';
import * as names from './names';
import * as stringify from 'json-stringify-safe';
import * as progress from 'progress';
import * as env from './env';
import { format } from 'util';
import { check } from './validate';
import { setProxy } from './interpolation';
import * as semver from 'semver';

/* Create configuration from existing project configuration file */
export function newConfig(projectPath: string, logger_level: string = 'off', envname?: string): IConfig {
    return { logger_level, location: projectPath, basePath: '.', cache: '.openwhisk', envname };
}

/* Create configuration from in-memory project configuration */
export function newConfigFromJSON(manifest: object, logger_level: string = 'off', envname?: string): IConfig {
    return { logger_level, manifest, basePath: '.', cache: '.openwhisk', envname };
}

/* Create new uninitialized config from existing one overriding manifest and environment */
export function cloneConfig(config: IConfig, projectPath: string, envname: string): IConfig {
    const newcfg = { ...config, location: projectPath, envname };
    newcfg._initialized = false;
    return newcfg;
}


export async function init(config: IConfig) {
    if (config._initialized)
        return;
    config._initialized = true;

    if (!config.logger)
        config.logger = getLogger();

    config.logger_level = config.logger_level || process.env.LOGGER_LEVEL || 'off';
    config.logger.level = config.logger_level;

    config.fatal = fatal(config);

    config._progresses = [];
    config.setProgress = setProgress(config);
    config.startProgress = startProgress(config);
    config.terminateProgress = terminateProgress(config);
    config.clearProgress = clearProgress(config);

    config.skipPhases = config.skipPhases || [];

    // desugar envname
    if (config.envname) {
        const { name, version } = parseEnvName(config.envname);
        config.envname = name;
        config.version = version;
    }

    try {
        await resolveManifest(config);
        await configCache(config);

        await plugins.init(config);
        await configVariableSources(config);

        if (config.manifest) {
            filter(config);

            if (!config.skipPhases.includes('validation')) {
                await check(config);

                const buildir = path.join(config.cache, 'build');
                await fs.mkdirs(buildir);
                await fs.writeJSON(path.join(buildir, 'project.json'), config.manifest, { spaces: 2 });
            }

            config.logger.debug(stringify(config.manifest, null, 2));
        }
    } catch (e) {
        config.clearProgress();
        config.logger.error(e);
        throw e;
    }
}

async function resolveManifest(config: IConfig) {
    config.startProgress('loading project configuration');

    if (config.manifest || config.manifest === '') {
        if (typeof config.manifest === 'string') {
            config.manifest = yaml.parse(config.manifest) || {};
        }
        config.basePath = config.basePath || process.cwd();
    } else if (config.location) {
        await mayGitClone(config);

        config.location = path.resolve(config.basePath || process.cwd(), config.location);
        config.basePath = path.parse(config.location).dir;

        await loadManifest(config);
    } else {
        config.logger.debug('no configuration found');
    }

    if (config.manifest) {
        if (config.manifest.basePath)
            config.basePath = path.resolve(config.basePath, config.manifest.basePath);

        config.projectname = config.manifest.name;

        setProxy(config, 'manifest');
    }

    config.logger.debug(`base path set to ${config.basePath}`);
    config.terminateProgress();
}

async function mayGitClone(config: IConfig) {
    if (config.location.startsWith('git+')) {
        config.location = await utils.gitClone(config, config.location.substr(4));
    }
}

async function loadManifest(config: IConfig) {
    config.startProgress(`reading ${config.location}`);
    const content = await fs.readFile(config.location);
    config.manifest = yaml.parse(Buffer.from(content).toString()) || {};
    config.clearProgress();
}

async function configCache(config: IConfig) {
    if (!config.cache) {
        if (config.basePath)
            config.cache = `${config.basePath}/.openwhisk`;
        else
            config.cache = expandHome('~/.openwhisk');

        await fs.mkdirs(config.cache); // async since using fs-extra
    } else {
        config.cache = path.resolve(config.cache);
    }

    config.logger.debug(`caching directory set to ${config.cache}`);
}

// Initialize OpenWhisk SDK
export async function initOW(config: IConfig, options: IWskProps = {}) {
    // Apply environment policies
    if (!config.hasOwnProperty('force')) {
        let actualenv = config.envname;
        if (!actualenv) {
            const wskprops = await env.getCurrent(config);
            if (wskprops)
                actualenv = wskprops.ENVNAME;
        }
        if (actualenv) {
            const policies = env.getEnvironment(config, actualenv);
            if (policies) {
                config.force = policies.writable;
            }
        }
    }

    if (config.dryrun)
        config.ow = fakeow;
    else
        config.ow = await env.initWsk(config, options);

    setOW(config, config.ow);
}

// --- helpers

function setOW(config: IConfig, ow) {
    if (!config.force) {
        ow.packages.change = ow.packages.create;
        ow.triggers.change = ow.triggers.create;
        ow.routes.change = ow.routes.create;
        ow.actions.change = ow.actions.create;
        ow.feeds.change = ow.feeds.create;
        ow.rules.change = ow.rules.create;
    } else {
        ow.packages.change = ow.packages.update;
        ow.triggers.change = ow.triggers.update;
        ow.routes.change = ow.routes.create;
        ow.actions.change = ow.actions.update;
        ow.feeds.change = ow.feeds.create;  // update? See issue #41
        ow.rules.change = ow.rules.update;
    }

    config.ow = ow;

    // patch route to support sending swagger.
    // see openwhisk-client-js issue #69
    ow.routes.change = function (options) {
        if (!options.hasOwnProperty('swagger')) {
            const missing = ['relpath', 'operation', 'action'].filter(param => !(options || {}).hasOwnProperty(param));

            if (missing.length) {
                throw new Error(`missing mandatory parameters: ${missing.join(', ')}`);
            }
        }

        const body = this.route_swagger_definition(options);
        const qs = this.qs(options, []);
        return this.client.request('POST', this.routeMgmtApiPath('createApi'), { body, qs });
    };

    ow.routes.route_swagger_definition = function (params) {
        if (params.hasOwnProperty('swagger')) {
            return { apidoc: { namespace: '_', swagger: params.swagger } };
        }

        const apidoc = {
            namespace: '_',
            gatewayBasePath: this.route_base_path(params),
            gatewayPath: params.relpath,
            gatewayMethod: params.operation,
            id: `API:_:${this.route_base_path(params)}`,
            action: this.route_swagger_action(params)
        };

        return { apidoc };
    };
}

// Mockup OpenWhisk client.
const fakeow = {
    actions: {
        create: () => true,
        list: () => [],
        get: () => true,
        invoke: () => true,
        delete: () => true,
        update: () => true
    },
    feeds: {
        create: () => true,
        list: () => [],
        get: () => true,
        invoke: () => true,
        delete: () => true,
        update: () => true
    },
    namespaces: {
        create: () => true,
        list: () => [],
        get: () => true,
        invoke: () => true,
        delete: () => true,
        update: () => true
    },
    packages: {
        create: () => true,
        list: () => [],
        get: () => true,
        invoke: () => true,
        delete: () => true,
        update: () => true
    },
    rules: {
        create: () => true,
        list: () => [],
        get: () => true,
        invoke: () => true,
        delete: () => true,
        update: () => true
    },
    routes: {
        create: () => true,
        list: () => [],
        get: () => true,
        invoke: () => true,
        delete: () => true,
        update: () => true
    },
    triggers: {
        create: () => true,
        list: () => [],
        get: () => true,
        invoke: () => true,
        delete: () => true,
        update: () => true
    }
};

async function configVariableSources(config: IConfig) {
    if (!config.variableSources) {

        // TODO: configurable
        config.variableSources = [
            (name) => process.env[name],
        ];
        const wskprops = plugins.getVariableSourcePlugin('wskprops');
        if (wskprops)
            config.variableSources.push(await wskprops.resolveVariableCreator(config));
    }
}

function fatal(config: IConfig) {
    return (fmt: string, ...args) => {
        config.clearProgress();

        // TODO: i8n
        const msg = format(fmt, ...args);
        config.logger.fatal(msg);
        throw new Error(msg);
    };
}

function startProgress(config: IConfig) {
    return (format, options) => {
        config._progresses.push({ format, options });
        renderProgress(config);
    };
}

function setProgress(config: IConfig) {
    return (format, options) => {
        if (config._progresses.length > 0)
            config._progresses.pop();

        config._progresses.push({ format, options });
        renderProgress(config);
    };
}

function clearProgress(config: IConfig) {
    return () => {
        config._progresses = [];
        renderProgress(config);
    };
}

function terminateProgress(config: IConfig) {
    return () => {
        if (config._progresses.length > 0)
            config._progresses.pop();

        renderProgress(config);
    };
}

function renderProgress(config: IConfig) {
    if (config.progress) {
        config.progress.terminate();
        config.progress = null;
    }

    if (config._progresses.length > 0) {
        const fullformat = config._progresses.map(v => v.format).join(' ... ');
        const fulloptions = config._progresses.reduce((prev, cur) => ({ ...prev, ...cur.options }), { total: 1, clear: true });

        config.progress = new progress(fullformat, fulloptions);
        config.progress.render();
        config.logger.debug(`progress: ${fullformat}`);
    } else {
        config.logger.debug('progress cleared');
    }
}

// Remove resources not processed in the environment
function filter(config: IConfig) {
    // TODO: should be configurable
    if (config.envname === 'api') {
        const manifest = config.manifest;
        delete manifest.packages;
        delete manifest.actions;
        delete manifest.rules;
        delete manifest.triggers;
    }
}

function parseEnvName(envname: string) {
    const matched = envname.match(/^([\w-]*)(@(.+))?$/);
    if (matched) {
        const version = matched[3];
        if (version && !semver.valid(version))
            throw new Error(`Malformed environment version ${version}`);
        return { name: matched[1], version };
    }
    throw new Error(`Malformed environment name ${envname}`);
}
