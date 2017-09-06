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

export async function undeploy(config: cfg.Config) {
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
        const promises = rules.map(rule => config.ow.rules.delete(rule));
        await Promise.all(promises);
    }

    async function cleanTriggers() {
        const triggers = await config.ow.triggers.list();
        const promises = triggers.map(trigger => config.ow.triggers.delete(trigger));
        await Promise.all(promises);
    }

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

    async function mustUndeployAction(action) {
        if (dryrun)
            return false;
        if (manifest) {
            let serviceAnnotation;
            if (service) {
                try {
                    const deployed = await ow.actions.get(action);
                    serviceAnnotation = getManagedAnnotation(deployed);
                } catch (e) {
                    config.logger.error(JSON.stringify(e));
                    return false;
                }
            }
           
            const qname = names.parseQName(`/${action.namespace}/${action.name}`);
            const description = utils.getAction(manifest, qname.pkg, qname.name);
            if (description) {
                if (serviceAnnotation && serviceAnnotation !== service) {
                    // action is managed by another service. Bail out
                    config.logger.fatal(`Fatal: action ${action.name} is managed by the service ${serviceAnnotation}`);
                    throw `Fatal: action ${action.name} is managed by the service ${serviceAnnotation}`;
                }
                return true;
            }
            // not in the manifest => undeploy only if belong to service
            return service ? service === serviceAnnotation : false;
        }

        // no manifest: undeploy all.
        return true;
    }

    async function mustUndeployPackage(pkg) {
        if (dryrun)
            return false;
        const deployed = await ow.packages.get(pkg);

        if (deployed.actions.length > 0)
            return false;

        if (manifest) {
            const serviceAnnotation = getManagedAnnotation(deployed);
            const description = utils.getPackage(manifest, pkg.name);
            if (description) {
                if (serviceAnnotation && serviceAnnotation !== service) {
                    // action is managed by another service. Bail out
                    config.logger.fatal(`Fatal conflict: package ${pkg.name} is managed by the service ${serviceAnnotation}`);
                    throw `Fatal conflict: package ${pkg.name} is managed by the service ${serviceAnnotation}`;
                }
                return true;
            }

            // not in the manifest => undeploy only if belong to service
            return service ? service === serviceAnnotation : false;
        }

        // no manifest: undeploy all.
        return true;
    }
}
