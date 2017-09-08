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
const readdir = require('recursive-readdir')
const path = require('path')
const fs = require('fs')
const yaml = require('yamljs')
const utils = require('./utils')

const excludesDirs = ['node_modules']
const includesExts = ['.js']
const includesFiles = ['package.json']

// Synchronize entities with local configuration file(s)
export async function apply(config) {

    const ignore = (file, stats) => {
        if (stats.isDirectory()) {
            if (file.startsWith('.'))
                return true
            if (excludesDirs.includes(file))
                return true
            return !(file.startsWith('actions') || file.startsWith('packages'))
        }

        if (stats.isFile()) {
            const parsed = path.parse(file)

            return !(includesExts.includes(parsed.ext) || includesFiles.includes(parsed.name))
        }
        return false
    }

    readdir('.', [ignore], (err, files) => {
        let config
        try {
            config = yaml.safeLoad(fs.readFileSync('openwhisk.yml', 'utf8'))
            console.log(config);
        } catch (e) {
            console.log(e)
            config = {}
        }

        // file is one of the following forms:
        // - actions/<action-name>.js
        // - actions/<action-name>/<action>.js
        // - packages/<package-name>/actions/<action-name>.js
        // - packages/<package-name>/actions/<action-name>/<action>.js
        // - packages/<package-name>/actions/<action-name>/package.json

        for (const file of files) {
            const parts = file.split(path.sep)
            console.log(parts)
            let actionName
            let packageName

            let part = parts.shift()
            if (part === 'packages') {
                packageName = parts.shift()
                part = parts.shift()
            }
            if (part === 'actions') {
                actionName = parts.shift()
                if (actionName && actionName.endsWith('.js'))
                    actionName = actionName.substr(0, actionName.length - 3)
            }

            if (actionName) {
                const actionCfg = utils.getOrCreateAction(config, packageName, actionName)
                
                actionCfg.location = file
            } else {
                // Not an action. Ignore. (or log?)
            }
        }

        try {
            const y = yaml.safeDump(config)
            fs.writeFileSync('openwhisk.yml', y)
            console.log(config);
        } catch (e) {
            // Our code generated an invalid YAML-compatible JSON value 
            console.log(e)   
        }
    })
}