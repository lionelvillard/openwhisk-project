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
import * as cfg from './init';

const names = require('./names');

enum Targets { JSON = 1, BASH, YAML };
 
export interface Config extends cfg.Config {
    target?: Targets;
}

export async function apply(config: Config) {
    await cfg.init(config);

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

    // -- Bash conversion functions.

    function toBash(json) {
        let result = writePackages(json.packages)
        result += writeActions(json.actions)
        return result
    }

    function writePackages(pkgs) {
        let bashPkgs = '#!/usr/bin/env bash\n'
        for (const pkg of pkgs) {
            if (pkg.binding.name)
                bashPkgs += `\n\nwsk package bind ${pkg.binding.namespace}/${pkg.binding.name} ${pkg.name}`
            else
                bashPkgs += `\n\nwsk package create ${pkg.name}`

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
                    bashSequence += `\n\nwsk action update ${pkgName}${action.name} `;
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

                    bashActions += `\n\nwsk action update ${pkgName}${action.name} ${loc}`;
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
    }
}
