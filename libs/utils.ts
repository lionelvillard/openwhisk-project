/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
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
const request = require('request-promise')
const fs = require('fs')

// Assign the source properties to target. Throw an exception when a conflict occurs.
export const mergeObjects = (target, source) => {
    if (source) {
        for (const key of Object.keys(source)) {
            if (target.hasOwnProperty(key))
                throw new Error(`Duplicate key ${key}`)
            target[key] = source[key]
        }
    }
    return target
}

// Initialize action with the `baseAction` properties
export const initFromBaseAction = baseAction => {
    const action: any = {}
    if (baseAction.limits)
        action.limits = baseAction.limits
    if (baseAction.annotations)
        action.annotations = baseAction.annotations
    if (baseAction.inputs)
        action.inputs = baseAction.inputs

    return action
}

// --- Conversion functions from manifest format to rest params

export const getAnnotations = (config, annotations) : any => {
    const converted = getKeyValues(annotations);
    if (config.manifest.name) {
        converted.push({ key: 'managed', value: config.manifest.name });
    }
    return converted;
}

export const getKeyValues = inputs => {
    if (inputs) {
        return Object.keys(inputs).map(key => ({ key, value: inputs[key] }))
    }
    return []
}

export const indexKeyValues = kvs => {
    const index = {}
    if (kvs) {
        kvs.forEach(kv => index[kv.key] = kv.value)
    }
    return index
}

// TODO: support ${} format 
const resolveValue = (value, args) => {
    if (typeof value === 'string' && value.startsWith('$')) {
        const key = value.substr(1)
        if (args.env && args.env[key])
            return args.env[key]

        return process.env[key]
    }
    return value
}

// --- low level deployment functions

export const deployRawAction = (ctx, actionName, action) => {
    ctx.logger.info(`[ACTION] [DEPLOYING] ${actionName}`);
    ctx.logger.trace(`[ACTION] [DEPLOYING] ${JSON.stringify(action)}`);
    return ctx.ow.actions.change({
        actionName,
        action
    }).then(r => {
        if (r.exec) delete r.exec.code;
        ctx.logger.info(`[ACTION] [DEPLOYED] ${JSON.stringify(r)}`);
    });
}

export const deployActionWithContent = (ctx, actionName, action, binary) => content => {
    action.exec.code = Buffer.from(content).toString(binary ? 'base64' : 'utf8');
    return deployRawAction(ctx, actionName, action);
}


// Helper functions managing openwhisk configuration files

export const getPackage = (manifest, packageName, create = false) => {
    let pkgCfg;
    if (packageName) {
        let pkgsCfg = manifest.packages;
        if (!pkgsCfg) {
            if (!create)
                return null;

            pkgsCfg = manifest.packages = {};
        }
        pkgCfg = pkgsCfg[packageName];
        if (!pkgCfg) {
            if (!create)
                return null;

            pkgCfg = manifest.packages[packageName] = {};
        }
    } else {
        pkgCfg = manifest;
    }
    return pkgCfg;
}

export const getAction = (manifest, packageName, actionName, create = false) => {
    const pkgCfg = getPackage(manifest, packageName, create)
    if (!pkgCfg)
        return null;

    let actionsCfg = pkgCfg.actions
    if (!actionsCfg) {
        if (!create)
            return null;
        actionsCfg = pkgCfg.actions = {}
    }
    let actionCfg = actionsCfg[actionName]
    if (!actionCfg) {
        if (!create)
            return null;

        actionCfg = actionsCfg[actionName] = {}
    }
    return actionCfg
}

export const getTrigger = (manifest, triggerName, create = false) => {
    let triggersCfg = manifest.triggers;
    if (!triggersCfg) {
        if (!create)
            return null;
        triggersCfg = manifest.triggers = {};
    }
    let triggerCfg = triggersCfg[triggerName];
    if (!triggerCfg) {
        if (!create)
            return null;

        triggerCfg = triggersCfg[triggerName] = {};
    }
    return triggerCfg;
}

export const getRule = (manifest, ruleName, create = false) => {
    let rulesCfg = manifest.rules;
    if (!rulesCfg) {
        if (!create)
            return null;
        rulesCfg = manifest.rules = {};
    }
    let ruleCfg = rulesCfg[ruleName];
    if (!ruleCfg) {
        if (!create)
            return null;

        ruleCfg = rulesCfg[ruleName] = {};
    }
    return ruleCfg;
}

export const getApi = (manifest, apiName, create = false) => {
    // TODO: currently treat apiname as being basePath
    let apisCfg = manifest.apis;
    if (!apisCfg) {
        if (!create)
            return null;
        apisCfg = manifest.apis = {};
    }
    let apiCfg = apisCfg[apiName];
    if (!apiCfg) {
        if (!create)
            return null;

        apiCfg = apisCfg[apiName] = {};
    }
    return apiCfg;
}

