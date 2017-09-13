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
import * as types from './types';
import { init } from './init';

const names = require('./names');

enum Targets { JSON = 1, BASH, YAML };

export interface Config extends types.Config {
    target?: Targets;
}

export async function apply(config: Config) {
    await init(config);

    config.target = config.target || Targets.JSON;

    const ow = config.ow;
    const dump = await dumpAll();

    switch (config.target) {
        case Targets.JSON:
            return dump;
        case Targets.BASH:
            return toBash(dump);
        case Targets.YAML:
            return toYAML(dump);
    }

    async function dumpAll() {
        const packages = await dumpPackages();
        const actions = await dumpActions();
        const rules = await dumpRules();
        const triggers = await dumpTriggers();
        const apis = await dumpApis();
        return { packages, actions, rules, triggers, apis };
    }

    async function dumpPackages() {
        const packages = await config.ow.packages.list();
        const promises = [];
        for (const pkg of packages) {
            promises.push(ow.packages.get(pkg));
        }
        return Promise.all(promises);
    }

    async function dumpActions() {
        const actions = await ow.actions.list();
        const promises = [];
        for (const action of actions) {
            promises.push(ow.actions.get(action));
        }
        return Promise.all(promises);
    }

    async function dumpRules() {
        const rules = await config.ow.rules.list();

        const promises = [];
        for (const rule of rules) {
            promises.push(ow.rules.get(rule));

        }
        return Promise.all(promises);
    }

    async function dumpTriggers() {
        const triggers = await config.ow.triggers.list();
        const promises = [];
        for (const trigger of triggers) {
            promises.push(ow.triggers.get(trigger));
        }
        return Promise.all(promises);
    }

    async function dumpApis() {
        const apis = (await config.ow.routes.list()).apis;
        return Object.keys(apis).map(key => apis[key].value.apidoc);
    }

}

// -- Bash conversion functions.

function toBash(json) {
    let result = writePackages(json.packages)
    result += writeActions(json.actions)
    return result
}

function writePackages(pkgs) {
    let bashPkgs = 
`#!/usr/bin/env bash

WSK=wsk

if [ "$OPENWHISK_HOME" != "" ]; then
  WSK=$OPENWHISK_HOME/bin/wsk 
fi

WSK="$WSK $OPENWHISK_INSECURE"
`;

    for (const pkg of pkgs) {
        if (pkg.binding.name)
            bashPkgs += `\n\n$WSK package bind ${pkg.binding.namespace}/${pkg.binding.name} ${pkg.name}`
        else
            bashPkgs += `\n\n$WSK package create ${pkg.name}`

        bashPkgs += writeKeyValues(pkg.parameters, '-p')
        bashPkgs += writeKeyValues(pkg.annotations, '-a')
    }
    return bashPkgs
}

function writeActions(actions) {
    let bashActions = '';
    let bashSequence = '';
    for (const action of actions) {
        const namespace = action.namespace;
        const parts = namespace.split('/');
        const pkgName = parts.length === 2 ? `${parts[1]}/` : '';
        const annos = action.annotations;
        const kind = action.exec.kind;

        // TODO: limits


        switch (kind) {
            case 'sequence':
                bashSequence += `\n\n$WSK action update ${pkgName}${action.name} `;
                let sep = '';
                action.exec.components.forEach(c => {
                    bashSequence += sep;
                    sep = ',';

                    const parts = names.parseQName(c);

                    // For now just trim the namespace if not /whisk.system/
                    if (parts.namespace === 'whisk.system')
                        bashSequence += '/whisk.system/';

                    if (parts.pkg)
                        bashSequence += `'${parts.pkg}/`;
                    bashSequence += `${parts.name}'`;
                });
                bashSequence += ' --sequence';
                bashSequence += writeKeyValues(action.parameters, '-p', ['_actions']);
                bashSequence += writeKeyValues(action.annotations, '-a', ['exec', 'parameters']);
                break;

            case 'nodejs:6':
                // Infer location.
                const afile = annos ? annos.find(item => item.key === 'file') : undefined;
                const file = afile ? afile.value : undefined;
                const loc = file ? file : `actions/${action.name}.js`;

                bashActions += `\n\n$WSK action update ${pkgName}${action.name} ${loc}`;
                bashActions += writeKeyValues(action.parameters, '-p');
                bashActions += writeKeyValues(action.annotations, '-a', ['exec', 'parameters']);
                break;
            default:
                throw `Refresh does not support action of kind ${kind}`;
        }

    }
    return `${bashActions}${bashSequence}`;
}

function writeKeyValues(kvs, flag, nokeys = []) {
    if (!kvs)
        return '';

    let bashKeyValues = '';
    for (const kv of kvs) {
        if (!nokeys.includes(kv.key)) {
            let value: any = kv.value;

            if (typeof value == 'object')
                value = `${JSON.stringify(value)}`
            if (typeof value === 'string')
                value = `"${value}"`

            bashKeyValues += ` \\\n  ${flag} ${kv.key} '${value}'`
        }
    }
    return bashKeyValues
}

// -- Yaml conversion functions.

function toYAML(json) {
    const iactions = indexActions(json.actions);

    const name = ymlName(json);
    const packages = ymlPackages(json, iactions);
    // TODO: default package
    //const actions = ymlActions('', json);

    return cleanup({ name, packages });
}

function ymlName(json) {
    // TODO: need to look for the annotation 'managed'
}

function ymlPackages(json, iactions) {
    const jpkgs = json.packages;
    if (!jpkgs)
        return null;

    const ypkgs = {};
    for (const jpkg of jpkgs) {
        ypkgs[jpkg.name] = ymlPackage(jpkg, iactions);
    }
    return ypkgs;
}

function ymlPackage(jpkg, iactions) {
    const inputs = ymlInputs(jpkg.parameters);
    const annotations = ymlAnnos(jpkg.annotations);
    const publish = jpkg.publish ? true : undefined;

    if (jpkg.binding.name) {
        return cleanup({ bind: jpkg.binding, inputs, annotations, publish });
    }

    const actions = {};
    for (const jaction of jpkg.actions) {
        const key = `/${jpkg.namespace}/${jpkg.name}/${jaction.name}`;
        actions[jaction.name] = ymlAction(iactions[key], jpkg.namespace, jpkg.name);
    }

    return cleanup({ actions, inputs, annotations, publish });
}

function ymlAction(jaction, pkgNamespace, pkgName) {
    const qname = `/${jaction.namespace}/${jaction.name}`;
    const inputs = ymlInputs(jaction.parameters);
    const annotations = ymlAnnos(jaction.annotations);
    const publish = jaction.publish ? true : undefined;

    const kind = jaction.exec.kind;
    switch (kind) {
        case 'sequence':
            const sequence = jaction.exec.components.map(c => names.relativeQName(c, pkgNamespace, pkgName)).join(', ');
            return cleanup({ sequence, inputs, annotations, publish });
        case 'nodejs:6':
            const location = retrieveLocation(qname, jaction.annotations);
            return cleanup({ location, inputs, annotations, publish });
        default:
            throw `Refresh does not support action of kind ${kind}`;
    }
}

function ymlInputs(jparams) {
    const inputs = [];
    for (const jparam of jparams) {
        if (!['_actions'].includes(jparam.key))
            inputs.push({ [jparam.key]: jparam.value });
    }
    return (inputs.length > 0) ? inputs : undefined;
}

function ymlAnnos(jannos) {
    const annotations = [];
    for (const janno of jannos) {
        // filter out builtin annotations
        if (!['exec', 'parameters', 'managed'].includes(janno.key))
            annotations.push({ [janno.key]: janno.value });
    }
    return (annotations.length > 0) ? annotations : undefined;
}

// --helpers

function cleanup(obj) {
    Object.keys(obj).forEach(key => {
        if (obj[key] === undefined)
            delete obj[key];
    });
    return obj;
}

function indexActions(actions) {
    const index = {}
    if (actions) {
        actions.forEach(action => {
            const key = `/${action.namespace}/${action.name}`;
            index[key] = action;
        });
    }
    return index;
}

// Heuristic computing the action location.
function retrieveLocation(actionQName, annos) {
    const afile = annos ? annos.find(item => item.key === 'file') : undefined;
    const file = afile ? afile.value : undefined;
    if (file)
        return file;

    const parts = names.parseQName(actionQName);
    if (parts.pkg) 
        return `packages/${parts.pkg}/actions/${parts.name}.js`;
    
    return `actions/${parts.name}.js`;
}
