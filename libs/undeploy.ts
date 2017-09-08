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
const utils = require('./utils');

// remove all entities
export async function all(ow) {
    return apply({ ow });
}

export async function apply(config: cfg.Config) {
    await cfg.init(config);

    const manifest = config.manifest; // if null, then delete all!
    const service = manifest ? manifest.name : null; // only delete resources belonging to the service.
    const ow = config.ow;
    const dryrun = config.dryrun;

    await cleanAll();
    return;

    async function cleanAll() {
        await cleanActions();
        await cleanPackages();
        await cleanRules();
        await cleanTriggers();
        await cleanApis();
    }

    async function cleanActions() {
        const actions = await ow.actions.list();
        const promises = [];
        for (const action of actions) {
            if (await mustUndeployAction(action)) {
                promises.push(ow.actions.delete(action));
            }
        }
        await Promise.all(promises);
    }

    async function cleanPackages() {
        const packages = await config.ow.packages.list();
        const promises = [];
        for (const pkg of packages) {
            if (await mustUndeployPackage(pkg)) {
                promises.push(ow.packages.delete(pkg));
            }
        }
        await Promise.all(promises);
    }

    async function cleanRules() {
        const rules = await config.ow.rules.list();

        const promises = [];
        for (const rule of rules) {
            if (await mustUndeployRule(rule)) {
                promises.push(ow.rules.delete(rule));
            }
        }
        await Promise.all(promises);
    }

    async function cleanTriggers() {
        const triggers = await config.ow.triggers.list();
        const promises = [];
        for (const trigger of triggers) {
            if (await mustUndeployTrigger(trigger)) {
                promises.push(ow.triggers.delete(trigger));
        
                // TODO: feed issue #39
            }
        }
        await Promise.all(promises);
    }

    async function cleanApis() {
        const apis = (await config.ow.routes.list()).apis;
        const promises = [];
        for (const api of apis) {
            const basepath =  api.value.apidoc.basePath;
            if (await mustUndeployApi(basepath)) {
                promises.push(ow.routes.delete({basepath})); 
            }
        }
        await Promise.all(promises);
    }

    async function mustUndeployAction(action) {
        if (dryrun)
            return false;

        let deployed
        try {
            deployed = await ow.actions.get(action);
        } catch (e) {
            return false; // does not exist => don't deploy
        }

        if (manifest) {
            let serviceAnnotation = getManagedAnnotation(deployed);

            const actionName = `/${action.namespace}/${action.name}`;
            const qname = names.parseQName(actionName);
            const inmanifest = utils.getAction(manifest, qname.pkg, qname.name);
            return mustUndeploy(inmanifest, serviceAnnotation, actionName);
        }

        // no manifest: undeploy all.
        return true;
    }

    async function mustUndeployPackage(pkg) {
        if (dryrun)
            return false;
        
        let deployed
        try {
            deployed = await ow.packages.get(pkg);
        } catch (e) {
            return false; // does not exist => don't deploy
        }

        if (deployed.actions.length > 0)
            return false;

        if (manifest) {
            const serviceAnnotation = getManagedAnnotation(deployed);
            const inmanifest = utils.getPackage(manifest, pkg.name);
            return mustUndeploy(inmanifest, serviceAnnotation, pkg.name);
        }

        // no manifest: undeploy all.
        return true;
    }

    async function mustUndeployRule(rule) {
        if (dryrun)
            return false;
        
        let deployed
        try {
            deployed = await ow.rules.get(rule);
        } catch (e) {
            return false; // does not exist => don't deploy
        }
        
        if (manifest) {
            const serviceAnnotation = getManagedAnnotation(deployed);
            const inmanifest = utils.getRule(manifest, rule.name);
            return mustUndeploy(inmanifest, serviceAnnotation, rule.name);
        }

        // no manifest: undeploy all.
        return true;
    }


    async function mustUndeployTrigger(trigger) {
        if (dryrun)
            return false;
        
        let deployed
        try {
            deployed = await ow.triggers.get(trigger);
        } catch (e) {
            return false; // does not exist => don't deploy
        }
        
        if (manifest) {
            const serviceAnnotation = getManagedAnnotation(deployed);
            const inmanifest = utils.getTrigger(manifest, trigger.name);
            return mustUndeploy(inmanifest, serviceAnnotation, trigger.name);
        }

        // no manifest: undeploy all.
        return true;
    }

    async function mustUndeployApi(basepath) {
        if (dryrun)
            return false;
        
        // TODO: routes.get
        // let deployed
        // try {
        //     deployed = await ow.routes.get(trigger);
        // } catch (e) {
        //     return false; // does not exist => don't deploy
        // }
        
        if (manifest) {
            const serviceAnnotation = null; // = getManagedAnnotation(deployed);
            const inmanifest = utils.getApi(manifest, basepath);
            return mustUndeploy(inmanifest, serviceAnnotation, basepath);
        }

        // no manifest: undeploy all.
        return true;
    }

    // utitites 
    
    function getManagedAnnotation(entity) {
        if (service) {
            const managedList = entity.annotations.filter(anno => anno.key === 'managed').map(kv => kv.value);
            if (managedList.length > 1) {
                config.logger.fatal(`multiple 'managed' annotations: ${JSON.stringify(managedList)}`);
                throw `Fatal: multiple 'managed' annotations found for entity ${entity.name}`;
            }
            return managedList[0];
        }
        return null;
    }
 
    function mustUndeploy(inmanifest, inservice, name) {
        if (inmanifest) {
            if (inservice && inservice !== service) {
                // entity is managed by another service. Bail out
                config.logger.fatal(`Fatal: ${name} is managed by the service ${inservice}`);
                throw `Fatal: ${name} is managed by the service ${inservice}`;
            }
            return true;
        }
        // not in the manifest => undeploy only if belong to service
        return service ? service === inservice : false;
    }

}
