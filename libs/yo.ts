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

import * as yeoman from 'yeoman-environment';
import * as path from 'path';
import * as fs from 'fs';

let env;

export function init(adapter) {
    if (!env) {
        env = yeoman.createEnv();
        if (adapter)
            env.adapter = adapter;
        let root = path.join(__dirname, '..', '..', 'node_modules', 'generator-openwhisk', 'generators');
        if (!fs.existsSync(root)) {
            root = path.join(__dirname, '..', '..', '..', 'generator-openwhisk', 'generators');
        }

        const generators = fs.readdirSync(root);
        for (const gen of generators)
            env.register(path.join(root, gen, 'index.js'), gen);
    }
}

// Run the given generator.
export function run(namespace) {
    return new Promise((resolve, reject) => {
        try {
            env.run(namespace, () => resolve());
        } catch (e) {
            reject(e);
        }
    });
}
