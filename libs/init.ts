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
import * as types from './types';
import * as plugins from './pluginmgr';

const utils = require('./utils');
const fakeow = require('./fakeow');

export async function init(config: types.Config) {
    if (!config.logger)
        config.logger = getLogger();

    config.logger_level = config.logger_level || process.env.LOGGER_LEVEL || 'off';
    config.logger.setLevel(config.logger_level);

    if (!config.ow) {
        config.ow = fakeow;
        config.dryrun = true;
        config.logger.info('perform a dryrun');
    }

    async function load(location: string) {
        config.logger.debug(`read local file ${location}`);
        const content = await fs.readFile(location);
        return content;
    };

    if (!config.load)
        config.load = load;

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

    check(config);

    config.logger.debug(JSON.stringify(config));
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
        config.logger.info('no configuration found');
    }

    if (config.manifest && config.manifest.basePath) {
        config.basePath = path.resolve(config.basePath, config.manifest.basePath);
    }

    config.logger.info(`base path set to ${config.basePath}`);
    // ok no manifest, fine.
}

async function loadManifest(config: types.Config) {
    const content = await config.load(config.location);
    config.manifest = yaml.parse(Buffer.from(content).toString());
}

async function configCache(config: types.Config) {
    if (!config.cache && config.basePath) {
        config.cache = `${config.basePath}/.openwhisk`
        await fs.mkdirs(config.cache) // async since using fs-extra

    }

    if (config.cache) {
        config.logger.info(`caching directory set to ${config.cache}`);
    } else {
        config.logger.info(`caching disabled`);
    }
}

// validate and transform the manifest to core representation.
function check(config: types.Config) {
    const manifest = config.manifest;

    if (!manifest)
        return

    config.logger.info('validating and normalizing the deployment configuration');

    checkPackages(config, manifest);

    // check for invalid additional properties
    for (const key in manifest) {
        if (!(key in types.deploymentProperties)) {
            config.logger.warn(`property /${key} ignored`);
        }
    }
}

function checkPackages(config: types.Config, manifest) {
    const packages = manifest.packages;

    for (const pkgName in packages) {
        const pkg = packages[pkgName];
        checkActions(config, manifest, pkgName, pkg.actions);
    }
}

function checkActions(config: types.Config, manifest, pkgName: string, actions) {
    for (const actionName in actions) {
        const action = actions[actionName];
        checkAction(config, manifest, pkgName, actions, actionName, action);
    }
}

function checkAction(config: types.Config, manifest, pkgName: string, actions, actionName: string, action: types.Action) {
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
      
        const plugin : any = plugins.getActionPlugin(action);
        if (!plugin) {
            config.logger.warn(`no plugin found for action ${actionName}. Ignored`);
            return;
        }

        const contributions = plugin.actionContributor(config, manifest, pkgName, actionName, action);
        
        for (const contrib of contributions) {
            switch (contrib.kind) {
                case "action":
                    const pkg = utils.getPackage(manifest, contrib.pkgName, true);
                    if (!pkg.actions)
                        pkg.actions = {};

                    if (pkg.actions[contrib.name]) {
                        throw `plugin ${plugin.__pluginName} overrides action ${contrib.name}`; 
                    }
                    
                    pkg.actions[contrib.name] = contrib.body;
                    checkAction(config, manifest, contrib.pkgName, pkg.actions, contrib.name, contrib.body);
                    break;
            }
        }
    }
}
