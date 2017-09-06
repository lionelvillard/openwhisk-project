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
const fs = require('fs-extra')
const bx = require('./bluemix')
const propertiesParser = require('properties-parser')

// Get all declared environments 
const getEnvironments = () => new Promise(resolve => {
    const ignore = (file, stats) => {
        if (stats.isDirectory())
            return true
        const name = path.basename(file)
        return !name.endsWith('.wskprops')
    }

    readdir('.', [ignore], (err, files) => {
        const result = []
        for (const file of files) {
            const envname = path.basename(file, '.wskprops').substr(1)
            if (envname !== 'global')
                result.push(envname)
        }
        resolve(result)
    })
})
exports.getEnvironments = getEnvironments

// Set current environment 
const setEnvironment = async envname => {
    const filename = `.${envname}.wskprops`
    let exists = await fs.exists(filename)
    if (!exists)
        return false

    exists = await fs.exists('.wskprops')
    if (exists) {
        await fs.copy('.wskprops', '.wskprops.bak', { overwrite: true })
    }
    
    // Resolve AUTH/APIHOST if needed.

    try {
        let props = propertiesParser.createEditor(filename)
        let changed = false
        let bxspace = props.get('BLUEMIX_SPACE')
        if (bxspace)
            bxspace = bxspace.trim()
        if (!props.get('AUTH')) {
            if (bxspace) {
                if (!bx.isBluemixCapable) {
                    console.error('bx not installed.')
                    return false
                }
                await bx.login()
                const key = await bx.createSpace(bxspace)
                console.log(key)
                if (!key) {
                    console.error(`error getting the openwhisk key for ${bxspace}`)
                    return false
                }

                props.set('AUTH', `${key.uuid}:${key.key}`)
                changed = true
            }
        }
        if (!props.get('APIHOST')) {
            if (bxspace) {
                props.set('APIHOST', 'https://openwhisk.ng.bluemix.net')
                changed = true
            }
        }

        if (changed) {
            props.save('.wskprops')
        } else {
            await fs.copy(filename, '.wskprops', { overwrite: true })
        }

    } catch (e) {
        console.error(e)
        // TODO: log
        return false
    }
    return true
}
exports.setEnvironment = setEnvironment