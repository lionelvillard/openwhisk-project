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
        const value = vs(config, name);
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