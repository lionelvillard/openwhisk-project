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

// Simple plugins manager
import * as fs from 'fs-extra';
import * as path from 'path';
import * as types from './types';

const PLUGINS_ROOT = path.join(__dirname, '../../plugins/node_modules');

const actionPlugins = {};
const apiPlugins = {};
const actionBuilderPlugins = {};

const RESERVED_ACTION_KEYWORDS = ['location', 'code', 'limits', 'inputs', 'kind', 'annotations', 'sequence', 'extra', 'actionName', 'packageName', 'docker'];
const RESERVED_API_KEYWORDS = [];

// Build plugin index.
export async function init(config: types.Config) {
    config.logger.info('initializing plugins');
    await registerAll(config);
}

async function registerAll(config: types.Config) {
    try {
        const files = await fs.readdir(PLUGINS_ROOT);

        for (const moduleid of files) {
            if (moduleid.match(/wskp-\w*-plugin/)) {
                const pkgPath = path.join(PLUGINS_ROOT, moduleid);
                const plugininfo = await fs.readJSON(path.join(pkgPath, 'package.json'));

                const contributions = plugininfo.wskp;
                if (!contributions) {
                    config.logger.warn(`Plugin ${moduleid} does not have any contributions`);
                    return;
                }

                const action = contributions.action;
                if (action) {
                    if (!RESERVED_ACTION_KEYWORDS.includes(action)) {
                        config.logger.info(`registering plugin ${moduleid} action contribution ${action}`);
                        actionPlugins[action] = pkgPath;
                    }
                    else
                        config.logger.warn(`Skipping ${action}: it is a reserved action name`);
                }
                const api = contributions.api;
                if (api) {
                    if (!RESERVED_API_KEYWORDS.includes(action)) {
                        config.logger.info(`registering plugin ${moduleid} api contribution ${api}`);
                        apiPlugins[api] = pkgPath;
                    }
                    else
                        config.logger.warn(`Skipping ${api}: it is a reserved api name`);
                }
                const builder = contributions.builder;
                if (builder) {
                    config.logger.info(`registering plugin ${moduleid} builder contribution ${builder}`);
                    actionBuilderPlugins[builder] = pkgPath;
                }
            }
        }

    } catch (e) {
        config.logger.error(JSON.stringify(e, null, 2));
    }
}

export function getActionPlugin(action): types.Plugin | null {
    return getPlugin(actionPlugins, action);
}

export function getApiPlugin(api): types.Plugin | null {
    return getPlugin(apiPlugins, api);
}

export function getActionBuilderPlugin(name): types.Plugin | null {
    if (actionBuilderPlugins[name]) {
        const plugin = require(actionBuilderPlugins[name]);
        plugin.__pluginName = name;
        return plugin;
    }
    return null;
}

function getPlugin(index, obj): types.Plugin | null {
    for (const name in index) {
        if (obj.hasOwnProperty(name)) {
            const plugin = require(index[name]);
            plugin.__pluginName = name;
            return plugin;
        }
    }
    return null;
}