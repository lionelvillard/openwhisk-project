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
import * as utils from './utils';
import { IConfig, IPlugin, IProject, IPackage, IAction, IContribution, IApi, ISyntaxContribution } from './types';

const PLUGINS_ROOT = path.join(__dirname, '../../plugins/core');
const EXT_PLUGINS_ROOT = path.join(__dirname, '../../plugins/node_modules');

const syntaxPlugins = {};
const actionPlugins = {};
const actionBuilderPlugins = {};
const variableSourcePlugins = {};

const plugins = {
    package: {},
    resource: {},
    resourceBinding: {},
    api: {}
};

const RESERVED_ACTION_KEYWORDS = ['location', 'code', 'limits', 'inputs', 'kind', 'annotations', 'sequence', 'extra', 'actionName', 'packageName', 'docker'];
const RESERVED_API_KEYWORDS = [];

let loaded = false;

// Build plugin index.
export async function init(config: IConfig) {
    if (!loaded) {
        config.logger.info(`initializing plugins ${PLUGINS_ROOT} and ${EXT_PLUGINS_ROOT}`);
        await registerAll(config);
        loaded = true;
    }
}

// Register plugin at given location
export async function registerFromPath(config: IConfig, modulepath: string) {
    const pkgjson = path.join(modulepath, 'package.json');
    if (!(await fs.pathExists(pkgjson)))
        return;

    const plugininfo = await fs.readJSON(path.join(modulepath, 'package.json'));

    const contributions = plugininfo.wskp;
    if (!contributions) {
        config.logger.warn(`Plugin ${plugininfo.name} does not have any contributions`);
        return;
    }

    const _path = contributions.syntax;
    if (_path) {
        config.logger.info(`registering plugin ${plugininfo.name} project contribution ${_path}`);
        // TODO: should really be a path!
        syntaxPlugins[_path] = modulepath;
    }

    const action = contributions.action;
    if (action) {
        if (!RESERVED_ACTION_KEYWORDS.includes(action)) {
            config.logger.info(`registering plugin ${plugininfo.name} action contribution ${action}`);
            actionPlugins[action] = modulepath;
        } else
            config.logger.warn(`Skipping ${action}: it is a reserved action name`);
    }

    registerContributionsForPlugin(config, plugininfo.name, modulepath, contributions, 'package');
    registerContributionsForPlugin(config, plugininfo.name, modulepath, contributions, 'resource');
    registerContributionsForPlugin(config, plugininfo.name, modulepath, contributions, 'resourceBinding');
    registerContributionsForPlugin(config, plugininfo.name, modulepath, contributions, 'api');

    const builder = contributions.builder;
    if (builder) {
        config.logger.info(`registering plugin ${plugininfo.name} builder contribution ${builder}`);
        actionBuilderPlugins[builder] = modulepath;
    }

    const variableSource = contributions.variableSource;
    if (variableSource) {
        config.logger.info(`registering plugin ${plugininfo.name} variable source contribution ${variableSource}`);
        variableSourcePlugins[variableSource] = modulepath;
    }
}

async function registerAll(config: IConfig) {
    await registerFiles(config, PLUGINS_ROOT);
    if (await fs.pathExists(EXT_PLUGINS_ROOT))
        await registerFiles(config, EXT_PLUGINS_ROOT);
}

async function registerFiles(config: IConfig, root: string) {
    const files = await fs.readdir(root);
    for (const moduleid of files) {
        if (moduleid.match(/wskp-\w*-plugin/)) {
            const modulepath = path.join(root, moduleid);

            await registerFromPath(config, modulepath);
        }
    }
}

function registerContributionsForPlugin(config: IConfig, pluginName: string, modulepath, contribs, kind: string) {
    if (contribs && contribs[kind]) {
        const contrib = contribs[kind];
        const names = (typeof contrib === 'string') ? [contrib] : contrib;
        for (const name of names) {
            config.logger.info(`registering plugin ${pluginName} ${kind} contribution ${name}`);
            plugins[kind][name] = modulepath;
        }
    }
}

export function getActionPlugin(action: IAction, name?: string): IPlugin | null {
    return name ? getPluginByName(actionPlugins, name) : lookupPlugin(actionPlugins, action);
}

export function getPackagePlugin(pkg: IPackage): IPlugin | null {
    return lookupPlugin(plugins.package, pkg);
}

export function getResourcePlugin(name: string): IPlugin | null {
    return getPluginByName(plugins.resource, name);
}

export function getResourceBindingPlugin(name: string): IPlugin | null {
    return getPluginByName(plugins.resourceBinding, name);
}

export function getApiPlugin(api: IApi): IPlugin | null {
    return lookupPlugin(plugins.api, api);
}

export function getActionBuilderPlugin(name): IPlugin | null {
    if (actionBuilderPlugins[name]) {
        const plugin = require(actionBuilderPlugins[name]);
        plugin.__pluginName = name;
        return plugin;
    }
    return null;
}

export function getVariableSourcePlugin(name): IPlugin | null {
    if (variableSourcePlugins[name]) {
        const plugin = require(variableSourcePlugins[name]);
        plugin.__pluginName = name;
        return plugin;
    }
    return null;
}

export function getSyntaxPlugin(name): IPlugin | null {
    if (syntaxPlugins[name]) {
        const plugin = require(syntaxPlugins[name]);
        plugin.__pluginName = name;
        return plugin;
    }
    return null;
}

function getPluginByName(index, name): IPlugin | null {
    if (index[name]) {
        const plugin = require(index[name]);
        if (plugin)
            plugin.__pluginName = name;
        return plugin;
    }
    return null;
}

function lookupPlugin(index, obj): IPlugin | null {
    for (const n in index) {
        if (obj.hasOwnProperty(n)) {
            const plugin = require(index[n]);
            plugin.__pluginName = n;
            return plugin;
        }
    }
    return null;
}

// --- Plugin contributions aware of async proxy

export async function applySyntaxContributions(config: IConfig, contributions: ISyntaxContribution[], plugin: IPlugin) {
    if (!contributions)
        return;
    const project = config.manifest;

    for (const contrib of contributions) {
        const parent = utils.getObject(project, contrib.path, true);
        if (parent.hasOwnProperty(contrib.name))
            config.fatal(`plugin ${plugin.__pluginName} overrides ${contrib.path}`);

        parent[contrib.name] = contrib.body;
    }
}