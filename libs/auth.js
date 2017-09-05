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
const fs = require('fs-extra')
const openwhisk = require('openwhisk')
const expandHomeDir = require('expand-home-dir')
const path = require('path')

const getWskPropsFile = () => {
    let wskprops = process.env.WSK_CONFIG_FILE
    if (!wskprops || !fs.existsSync(wskprops)) {
        const until = path.dirname(expandHomeDir('~'))
        let current = process.cwd()
        while (current !== '/' && current !== until) {
            wskprops = path.join(current, '.wskprops')

            if (fs.existsSync(wskprops))
                break
            current = path.dirname(current)
        }
    }
    return wskprops
}
exports.getWskPropsFile = getWskPropsFile

const readWskProps = () => {
    const wskprops = getWskPropsFile()
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
exports.readWskProps = readWskProps

// Resolve auth and api host, independently (TODO)
const auth = (options = {}) => {
    if (options.auth)
        return options

    const wskprops = readWskProps()

    if (wskprops) {
        return {
            api_key: wskprops.AUTH,
            apihost: wskprops.APIHOST,
            ignore_certs: wskprops.IGNORE_CERTS || false
        }
    }

    return null
}
exports.auth = auth

// Resolve variables by merging command line options with .wskprops content
const resolveVariables = (options = {}) => {
    const wskprops = readWskProps() || {}
    const variables = {}

    variables.auth = options.auth || wskprops.AUTH
    variables.apihost = options.apihost || wskprops.APIHOST
    variables.ignore_certs = options.ignore_certs || wskprops.IGNORE_CERTS || false

    return variables
}
exports.resolveVariables = resolveVariables

const initWsk = (options = {}) => {
    const vars = resolveVariables(options);
    return openwhisk({ api_key: vars.auth, apihost: vars.apihost, ignore_certs: vars.ignore_certs })
}
exports.initWsk = initWsk
