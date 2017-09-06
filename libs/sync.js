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

const yeoman = require('yeoman-environment');
const path = require('path');
const fs = require('fs');

let env;

function init() {
    return new Promise(resolve => {
        if (!env) {
            env = yeoman.createEnv();
            const root = path.join(__dirname, '..', 'node_modules', 'generator-openwhisk', 'generators');
            const generators = fs.readdirSync(root);
            for (const gen of generators)
                env.register(path.join(root, gen, 'index.js'), gen);
        }
        resolve()
    });
}

// Run the given generator.
function run(namespace) {
    return init()
        .then(() => env.run(namespace, () => true));
}
exports.run = run;
