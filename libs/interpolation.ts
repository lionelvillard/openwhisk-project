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
import * as deepis from 'deep-is';
import { EventEmitter } from 'events';

// recursively evaluate expressions in obj
export function evaluateAll(config: types.Config, obj: any, filter?: string[]) {
    return obj ? evaluateAllI(config, obj, filter || [], '') : obj;
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
        self: config.manifest, // Proxy has already been installed.
        proxy: new Proxy({}, proxyHandler),
        convert
    };

    const sandbox = vm.createContext(context);
    return vm.runInContext(expr, sandbox);
}

/**
 * Evaluate expression until all related tasks have been terminated.
 * @return the evaluated expression. Return undefined when an error occur
 */
export async function fullyEvaluate(config: types.Config, expr: string) {
    try {
        let value = evaluate(config, expr);
        if (!value || !value.tasks)
            return value;

        return Promise.all(value.tasks).then(v => fullyEvaluate(config, value.expr));
    } catch (e) {
        config.logger.info(`an error occurred while evaluating ${expr}`);
        config.logger.info(e);
        return undefined;
    }
}

/** Block until the value pointed by the path expression and property equals to the given value */
export async function blockUntil(config: types.Config, path: string, property: string, expected: any) {
    const expr = `\${${path}.${property}}`;
    let value = await fullyEvaluate(config, expr);
    if (deepis(value, expected)) {
        return value;
    }

    // Need to watch for changes
    const obj = evaluate(config, `\${${path}}`);
    if (typeof obj !== 'object')
        return undefined;

    value = obj[property];
    while (!deepis(value, expected)) {
        value = await watchSetOnce(obj, property);
    }
    return value;
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
        if (expr && expr.task) {
            return { expr: expr.expr, tasks: [expr.task] };
        }
        return expr; // preserve expression type.
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

class AsyncEmitter extends EventEmitter { }
const asyncEmitter = new AsyncEmitter();

async function watchSetOnce(target: object, property: string) {
    return new Promise(resolve => {
        const listener = (target2, property2, value) => {
            if (target === target2 && property === property2) {
                asyncEmitter.removeListener('set', listener);
                resolve(value);
            }
        };
        asyncEmitter.on('set', listener);
    });
}

// Keep track of proxy objects to avoid duplication.
let proxies = new WeakSet();

// Proxied object, indexed by their unique id
let handlers = {};

/** Set async proxy on parent[name] */
export function setProxy(parent: any, name: string) {
    const obj = parent[name];
    if (obj && typeof obj === 'object' && !proxies.has(obj)) {
        const handler = new AsyncHandler();
        const proxy = new Proxy(obj, handler);
        proxies.add(proxy);

        parent[name] = proxy;
        handlers[handler.id] = proxy;
        return proxy;
    }
    return obj;
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

        let value = target[name];
        if (value instanceof Task) {
            if (value.resolved) {
                value = target[name] = value.resolved; // is set called?
            } else {
                // return partially evaluated expression. Can be evaluated when task is completed.
                return { expr: `\${proxy.${this.id}.${name}}`, task: value };
            }
        }

        // Make sure proxy is set.
        return setProxy(target, name);
    }

    public set(target, property, value, receiver) {
        target[property] = value;
        asyncEmitter.emit('set', receiver, property, value);
        return true;
    }

}

export const proxyHandler = {

    get: (target, id) => {
        return handlers[id];
    }

};
