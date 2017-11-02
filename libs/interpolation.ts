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
import { IConfig, IProject } from './types';
import { Task } from './coordinator';

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
    expr = `convert\`${expr}\``;
    config.logger.info(`evaluate ${expr}`);

    const variableHandler = {
        get: (target, name) => resolveVariable(config, name)
    };

    const context = {
        vars: new Proxy({}, variableHandler),
        self: config.manifest,
        proxy: new Proxy({}, proxyHandler),
        convert
    };

    const sandbox = vm.createContext(context);
    return vm.runInContext(expr, sandbox);
}

export async function fullyEvaluate(config: types.Config, expr: string) {
    let value = evaluate(config, expr);
    if (!value.tasks)
        return value;

    return Task.all(value.tasks).then(v => fullyEvaluate(config, value.expr));
}

function resolveVariable(config, name) {
    for (const vs of config.variableSources) {
        const value = vs(name);
        if (value)
            return value;
    }
    if (name === 'envname')
        return config.envname;

    config.fatal('undefined variable %s', name);
}

// Post expression evaluation: concat strings/exprs only when expression result is not a single value.
function convert(strings, ...exprs) {
    if (exprs.length === 1 && strings.length <= 2 && strings.join('') === '') {
        const expr = exprs[0];
        if (expr.task) {
            return { expr: expr.expr, tasks: [ expr.task ] };
        }
        return exprs[0]; // preserve expression type.
    }

    // convert to string
    let concat = '';
    let expri = 0;
    const tasks = [];
    for (let i = 0; i < strings.length - 1; i++) {
        concat += strings[i];
        const expr = exprs[expri++];
        if (expr.task) {
            concat += expr.expr;
            tasks.push(expr.task);
        } else {
            concat += expr;
        }
    }
    concat += strings[strings.length - 1];
    return tasks.length > 0 ? { expr: concat, tasks } : concat;
}

// --- Async proxy

// Keep track of proxy objects to avoid duplication.
let proxies = new WeakSet();

// Proxied object, indexed by their unique id
let handlers = {};

// Set async proxy of parent[name]
export function setProxy(parent: any, name: string) {
    const obj = parent[name];
    if (obj && typeof obj === 'object' && !proxies.has(obj)) {
        const handler = new AsyncHandler();
        const proxy = new Proxy(obj, handler);
        proxies.add(proxy);

        parent[name] = proxy;
        handlers[handler.id] = proxy;
    }
}

// reset state (should be only needed for test suites)
export function reset() {
    AsyncHandler.idcounter = 0;
    proxies = new WeakSet();
    handlers = {};
}

// --- Partial evaluation support

// Proxy handler with Promise support
class AsyncHandler {

    // counter for generating ids
    static idcounter = 0;

    // unique id
    public id: string;

    public constructor() {
        this.id = '_' + AsyncHandler.idcounter++;
    }

    public get(target, name) {
        if (!target.hasOwnProperty(name))
            return target[name];

        const value = target[name];
        if (value instanceof Task) {
            this.installPatcher(target, name, value);

            // return partially evaluated expression. Can be evaluated when task is completed.
            return { expr: `\${proxy.${this.id}.${name}}`, task: value };
        } else {
            // Make sure proxy is set.
            setProxy(target, name);
        }

        return value;
    }

    private installPatcher(target, name, value: Task<any>) {
        if (!value.patcher) {
            value.then(v => {
                // Replace task by actual value (which could be another task)
                target[name] = v;

                // Install proxy (for object)
                setProxy(target, name);
            });

            value.patcher = true;
        }
    }
}

export const proxyHandler = {

    get: (target, id) => {
        return handlers[id];
    }

};
