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

const actionPlugins = {}
const RESERVED_ACTION_KEYWORDS = ['location', 'code', 'limits', 'inputs', 'kind', 'zip', 'annotations', 'sequence', 'extra', 'actionName', 'packageName', 'docker']

// Build plugin index.
export async function init(config: types.Config) {
    config.logger.info('initializing plugins');

    return loadDescs(config, './plugins/actions');
}

async function loadDescs(config: types.Config, dir: string) {
    const root = path.join(__dirname, '..', dir);
    try {
        const files = await fs.readdir(root);

        for (const file of files) {
            if (!RESERVED_ACTION_KEYWORDS.includes(file)) {
                config.logger.info(`registering plugin ${file}`);
                actionPlugins[file] = path.join(root, file);
            }
            else
                config.logger.warn(`Skipping ${file}: it is a reserved plugin name`);
        }

    } catch (e) {
        config.logger.error(JSON.stringify(e, null, 2));
    }
}

export function getActionPlugin(action) : types.Plugin | null {
    for (const name in actionPlugins) {
        if (action.hasOwnProperty(name)) {
            const plugin = require(actionPlugins[name]);
            plugin.__pluginName = name;
            return plugin;
        }
    }
    return null;
}