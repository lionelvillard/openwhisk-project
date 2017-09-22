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
import { getLogger, configure } from 'log4js';
import * as fs from 'fs-extra';
import * as yaml from 'yamljs';
import * as path from 'path';
import * as types from './types';
import * as plugins from './pluginmgr';
import * as expandHome from 'expand-home-dir';

const utils = require('./utils');

export async function init(config: types.Config) {
    if (!config.logger)
        config.logger = getLogger();

    config.logger_level = config.logger_level || process.env.LOGGER_LEVEL || 'off';
    config.logger.setLevel(config.logger_level);

    if (!config.ow) {
        config.ow = fakeow;
        config.dryrun = true;
        config.logger.debug('perform a dryrun');
    }

    const ow = config.ow;
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
        ow.routes.change = ow.routes.update;
        ow.actions.change = ow.actions.update;
        ow.feeds.change = ow.feeds.create;  // update? See issue #41
        ow.rules.change = ow.rules.update;
    }
    config.ow = ow;

    await plugins.init(config);

    await resolveManifest(config);
    await configCache(config);

    await check(config);

    config.logger.debug(JSON.stringify(config, null, 2));
}

async function resolveManifest(config: types.Config) {
    config.logger.info('loading configuration');
    if (config.manifest || config.manifest === '') {

        if (typeof config.manifest === 'string') {
            config.manifest = yaml.parse(config.manifest) || {};
        }
        config.basePath = config.basePath || process.cwd();
    } else if (config.location) {
        config.location = path.resolve(config.basePath || process.cwd(), config.location);
        config.basePath = path.parse(config.location).dir;

        await loadManifest(config);
    } else {
        config.logger.debug('no configuration found');
    }

    if (config.manifest && config.manifest.basePath) {
        config.basePath = path.resolve(config.basePath, config.manifest.basePath);
    }

    config.logger.debug(`base path set to ${config.basePath}`);
    // ok no manifest, fine.
}

async function loadManifest(config: types.Config) {
    const content = await fs.readFile(config.location);
    config.manifest = yaml.parse(Buffer.from(content).toString());
}

async function configCache(config: types.Config) {
    if (!config.cache) {
        if (config.basePath)
            config.cache = `${config.basePath}/.openwhisk`
        else
            config.cache = expandHome('~/.openwhisk')

        await fs.mkdirs(config.cache) // async since using fs-extra
    }

    config.logger.debug(`caching directory set to ${config.cache}`);
}

// validate and transform the manifest to core representation.
async function check(config: types.Config) {
    const manifest = config.manifest;

    if (!manifest)
        return

    config.logger.debug('validating and normalizing the deployment configuration');

    await checkPackages(config, manifest);
    await checkApis(config, manifest);

    // check for invalid additional properties
    for (const key in manifest) {
        if (!(key in types.deploymentProperties)) {
            config.logger.warn(`property /${key} ignored`);
        }
    }
}

async function checkPackages(config: types.Config, manifest) {
    const packages = manifest.packages;

    for (const pkgName in packages) {
        await checkPackage(config, manifest, pkgName, packages[pkgName]);
    }
}


async function checkPackage(config: types.Config, manifest, pkgName, pkg) {
    const packages = manifest.packages;

    if (pkg.bind) {
        // TODO
    } else if (pkg.service) {
        delete packages[pkgName];

        const plugin = plugins.getServicePlugin(pkg.service);
        if (!plugin) {
            config.logger.warn(`no plugin found for service ${pkg.service}. Ignored`);
            return;
        }

        const contributions = await plugin.serviceContributor(config, pkgName, pkg);
        await applyConstributions(config, manifest, contributions, plugin);
    } else {
        await checkActions(config, manifest, pkgName, pkg.actions);
    }
}

async function checkActions(config: types.Config, manifest, pkgName: string, actions) {
    for (const actionName in actions) {
        const action = actions[actionName];
        await checkAction(config, manifest, pkgName, actions, actionName, action);
    }
}

async function checkAction(config: types.Config, manifest, pkgName: string, actions, actionName: string, action: types.Action) {
    if (action.location) { // builtin basic action

        // TODO
    } else if (action.sequence) { // builtin sequence action

        // TODO
    } else if (action.copy) { // builtin copy action

        // TODO
    } else if (action.code) { // builtin inlined action

        // TODO
    } else if (action.docker) { // builtin docker action

        // TODO
    } else {
        delete actions[actionName];

        const plugin = plugins.getActionPlugin(action);
        if (!plugin) {
            config.logger.warn(`no plugin found for action ${actionName}. Ignored`);
            return;
        }

        const contributions = await plugin.actionContributor(config, manifest, pkgName, actionName, action);
        await applyConstributions(config, manifest, contributions, plugin);
    }
}

async function checkApis(config: types.Config, manifest) {
    const apis = manifest.apis;

    for (const apiname in apis) {
        const api = apis[apiname];
        await checkApi(config, manifest, apis, apiname, api);
    }
}

async function checkApi(config: types.Config, manifest, apis, apiname: string, api: types.Api) {
    if (api.paths) { // builtin api
    } else {
        delete apis[apiname];

        const plugin = plugins.getApiPlugin(api);
        if (!plugin) {
            config.logger.warn(`no plugin found for api ${apiname}. Ignored`);
            return;
        }
        config.logger.debug(`getting contribution from plugin ${(<any>plugin).__pluginName}`);

        const contributions = await plugin.apiContributor(config, manifest, apiname, api);
        await applyConstributions(config, manifest, contributions, plugin);
    }

}

async function applyConstributions(config: types.Config, manifest: types.Deployment, contributions: types.Contribution[], plugin) {
    if (contributions) {
        for (const contrib of contributions) {
            switch (contrib.kind) {
                case 'action':
                    const pkg = utils.getPackage(manifest, contrib.pkgName, true);
                    if (!pkg.actions)
                        pkg.actions = {};

                    if (pkg.actions[contrib.name]) {
                        throw `plugin ${plugin.__pluginName} overrides ${contrib.name}`;
                    }

                    pkg.actions[contrib.name] = contrib.body;
                    await checkAction(config, manifest, contrib.pkgName, pkg.actions, contrib.name, contrib.body);
                    break;
                case 'api':
                    if (!manifest.apis)
                        manifest.apis = {};
                    const apis = manifest.apis;

                    if (apis[contrib.name]) {
                        throw `plugin ${plugin.__pluginName} overrides ${contrib.name}`;
                    }

                    apis[contrib.name] = contrib.body;
                    await checkApi(config, manifest, apis, contrib.name, contrib.body);
                    break;
                case 'package':
                    if (!manifest.packages)
                        manifest.packages = {};
                    const pkgs = manifest.packages;

                    if (pkgs[contrib.name]) {
                        throw `plugin ${plugin.__pluginName} overrides ${contrib.name}`;
                    }

                    pkgs[contrib.name] = contrib.body;
                    await checkPackage(config, manifest, contrib.name, contrib.body);
                    break;

            }
        }
    }
}

// Mockup OpenWhisk client.
const fakeow = {
    actions: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    feeds: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    namepaces: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    packages: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    rules: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    routes: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    },
    triggers: {
        create: () => Promise.resolve(true),
        list: () => Promise.resolve(true),
        get: () => Promise.resolve(true),
        invoke: () => Promise.resolve(true),
        delete: () => Promise.resolve(true),
        update: () => Promise.resolve(true)
    }
}
