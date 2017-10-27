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
import * as util from 'util';
import * as types from './types';
import * as vm from 'vm';

// recursively evaluate expressions in obj
export function evaluateAll(config: types.Config, obj: any, filter?: string[]) {
    return evaluateAllI(config, obj, filter || [], '');
}

function evaluateAllI(config: types.Config, obj: any, filter: string[], path: string) {
    switch (typeof obj) {
        case 'string':
            return filter.includes(path) ? obj : evaluate(config, obj);
        case 'object':
            for (const key in obj) {
                obj[key] = evaluateAllI(config, obj[key], filter, `${path}.${key}`);
            }
            return obj;
        default:
            return obj;
    }
}

export function evaluate(config: types.Config, expr: string) {
    expr = `\`${expr}\``;
    config.logger.info(`evaluate ${expr}`);

    const variableHandler = {
        get: (target, name) => resolveVariable(config, name)
    };

    const selfHandler = {
        get: (target, name) => resolveSelf(config, name)
    };

    const context = {
        vars: new Proxy({}, variableHandler),
        self: new Proxy({}, selfHandler)
    }

    const sandbox = vm.createContext(context);
    const result = vm.runInContext(expr, sandbox);
    config.logger.info(`result: ${result}`);
    return result;
}

function resolveVariable(config, name) {
    for (const vs of config.variableSources) {
        const value = vs(name);
        if (value)
            return value;
    }
    if (name === 'envname')
        return config.envname;

    throw `Undefined variable ${name}`;
}

function resolveSelf(config, name) {
    return config.manifest[name];
}