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

const PLUGINS_ROOT = path.join(__dirname, '../../plugins/core');

const actionPlugins = {};
const pkgPlugins = {};
const servicePlugins = {};
const apiPlugins = {};
const actionBuilderPlugins = {};

const RESERVED_ACTION_KEYWORDS = ['location', 'code', 'limits', 'inputs', 'kind', 'annotations', 'sequence', 'extra', 'actionName', 'packageName', 'docker'];
const RESERVED_API_KEYWORDS = [];

// Build plugin index.
export async function init(config: types.Config) {
    config.logger.info('initializing plugins');
    await registerAll(config);
}

// Register plugin at given location 
export async function registerFromPath(config: types.Config, modulepath: string) {
    const plugininfo = await fs.readJSON(path.join(modulepath, 'package.json'));

    const contributions = plugininfo.wskp;
    if (!contributions) {
        config.logger.warn(`Plugin ${plugininfo.name} does not have any contributions`);
        return;
    }

    const action = contributions.action;
    if (action) {
        if (!RESERVED_ACTION_KEYWORDS.includes(action)) {
            config.logger.info(`registering plugin ${plugininfo.name} action contribution ${action}`);
            actionPlugins[action] = modulepath;
        }
        else
            config.logger.warn(`Skipping ${action}: it is a reserved action name`);
    }

    const pkg = contributions.package;
    if (pkg) {
        const pkgs = (typeof pkg === 'string') ? [pkg] : pkg;
        for (const name of pkgs) {
            config.logger.info(`registering plugin ${plugininfo.name} package contribution ${name}`);
            pkgPlugins[name] = modulepath;
        }
    }

    const service = contributions.service;
    if (service) {
        const names = (typeof pkg === 'string') ? [service] : service;
        for (const name of names) {
            config.logger.info(`registering plugin ${plugininfo.name} service contribution ${name}`);
            servicePlugins[name] = modulepath;
        }
    }

    const api = contributions.api;
    if (api) {
        if (!RESERVED_API_KEYWORDS.includes(action)) {
            config.logger.info(`registering plugin ${plugininfo.name} api contribution ${api}`);
            apiPlugins[api] = modulepath;
        }
        else
            config.logger.warn(`Skipping ${api}: it is a reserved api name`);
    }
    const builder = contributions.builder;
    if (builder) {
        config.logger.info(`registering plugin ${plugininfo.name} builder contribution ${builder}`);
        actionBuilderPlugins[builder] = modulepath;
    }
}

async function registerAll(config: types.Config) {
    try {
        const files = await fs.readdir(PLUGINS_ROOT);

        for (const moduleid of files) {
            if (moduleid.match(/wskp-\w*-plugin/)) {
                const modulepath = path.join(PLUGINS_ROOT, moduleid);
                registerFromPath(config, modulepath);
            }
        }
    } catch (e) {
        config.logger.error(JSON.stringify(e, null, 2));
    }
}

export function getActionPlugin(action): types.Plugin | null {
    return getPlugin(actionPlugins, action);
}

export function getPackagePlugin(pkg): types.Plugin | null {
    return getPlugin(pkgPlugins, pkg);
}

export function getServicePlugin(name): types.Plugin | null {
    if (servicePlugins[name]) {
        const plugin = require(servicePlugins[name]);
        plugin.__pluginName = name;
        return plugin;
    }
    return null;
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