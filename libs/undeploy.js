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

module.exports = (ow, args) => {

    async function cleanAll() {
        await cleanActions();
        await cleanPackages();
        await cleanRules();
        return cleanTriggers();
    }

    async function cleanActions() {
        const actions = await ow.actions.list();
        const promises = actions.map(action => ow.actions.delete(action));
        return Promise.all(promises);
    }

    async function cleanPackages() {
        const packages = await ow.packages.list();
        const promises = packages.map(pkg => ow.packages.delete(pkg));
        return Promise.all(promises);
    }

    async function cleanRules() {
        const rules = await ow.rules.list();
        const promises = rules.map(rule => ow.rules.delete(rule));
        return Promise.all(promises);
    }

    async function cleanTriggers() {
        const triggers = await ow.triggers.list();
        const promises = triggers.map(trigger => ow.triggers.delete(trigger));
        return Promise.all(promises);
    }

    return cleanAll();
}
