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
import * as fs from 'fs-extra'
import * as expandHomeDir from 'expand-home-dir';
import * as path from 'path';

export function resolveVariable(config, name: string) {
    const wskprops = readWskProps(config);
    return wskprops ? wskprops[name] : undefined;
};

function getWskPropsFile(config) {
    let wskprops = process.env.WSK_CONFIG_FILE
    if (!wskprops || !fs.existsSync(wskprops)) {
        const env = config.env || '';

        const until = path.dirname(expandHomeDir('~'))
        let current = process.cwd()
        while (current !== '/' && current !== until) {
            // first try .<env>.wskprops
            if (env) {
                wskprops = path.join(current, '.', env, '.wskprops')

                if (fs.existsSync(wskprops))
                    break;
            }
            // then try .wskprops
            wskprops = path.join(current, '.wskprops')
            if (fs.existsSync(wskprops))
                break;

            // not found: look in parent directory
            current = path.dirname(current)
        }
    }
    return wskprops
}


function readWskProps(config) {
    const wskprops = getWskPropsFile(config);
    if (wskprops) {
        const propertiesParser = require('properties-parser')
        try {
            return propertiesParser.read(wskprops)
        } catch (e) {
            return null
        }
    }
    return null
}
