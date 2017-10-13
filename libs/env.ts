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
import * as init from './init';
import * as types from './types';
import * as bx from './bluemix';
import * as utils from './utils';
import * as readdir from 'recursive-readdir';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as propertiesParser from 'properties-parser';
import * as expandHome from 'expand-home-dir';
import * as openwhisk from 'openwhisk';

export interface IWskProps {
    AUTH? : string,
    APIHOST?: string,
    IGNORE_CERTS?:  boolean,
    APIGW_ACCESS_TOKEN?: string,
    [key:string]: any
}

// Get all declared environments 
export async function getEnvironments(config: types.Config) {
    await init.init(config);
    config.logger.info('get project environments');

    const ignore = (file, stats) => {
        if (stats.isDirectory())
            return true;
        const name = path.basename(file);
        return !name.endsWith('.wskprops');
    }

    try {
        const files: string[] = readdir('.', [ignore]);
        return files.map(file => path.basename(file, '.wskprops').substr(1));
    } catch (e) {
        config.logger.error(e);
    }
}

// Set current environment 
export async function setEnvironment(config: types.Config, copy: boolean = true) {
    await init.init(config);
    const envname = config.envname;
    config.logger.info(`set project environment to ${envname}`);
    const filename = `.${envname}.wskprops`;

    let exists = await fs.pathExists(filename);
    if (!exists)
        return false;

    const cached = getCachedEnvFilename(config);
    await fs.mkdirs(path.dirname(cached));
    exists = await fs.pathExists(cached);

    const stat1 = exists ? await fs.stat(filename) : null;
    const stat2 = exists ? await fs.stat(cached) : null;
    if (!exists || stat1.ctimeMs > stat2.ctimeMs) {
        // refresh cache

        const props = propertiesParser.createEditor(filename);
        await resolveProps(config, envname, filename, props);

        props.save(cached);
    }

    if (copy) {
        exists = await fs.pathExists('.wskprops');
        if (exists) {
            await fs.copy('.wskprops', '.wskprops.bak', { overwrite: true });
        }
        await fs.copy(cached, '.wskprops', { overwrite: true });
    }
    return true;
}


async function resolveProps(config: types.Config, envname: string, filename: string, props) {
    const apihost = props.get('APIHOST');
    if (!apihost) {
        throw `missing APIHOST in ${filename}`;
    }

    if (!props.get('AUTH')) {
        if (apihost.endsWith('bluemix.net')) {
            await resolveAuthFromBluemix(config, props, envname);
        } else {
            throw 'cannot resolve AUTH';
        }
    }
}

async function resolveAuthFromBluemix(config: types.Config, props, envname: string) {
    if (!bx.isBluemixCapable()) {
        config.logger.error('bx not is installed.')
        throw 'bx is not installed';
    }

    let bxorg = props.get('BLUEMIX_ORG');
    if (!bxorg) {
        config.logger.error('missing BLUEMIX_ORG in .wskprops');
        throw 'missing BLUEMIX_ORG in .wskprops';
    }

    let bxspace = props.get('BLUEMIX_SPACE');
    bxspace = bxspace ? bxspace.trim() : null;
    if (!bxspace) {
        // Generate space from manifest
        if (!config.manifest)
            throw 'Cannot resolve AUTH: missing BLUEMIX_SPACE or project configuration';
        const name = config.manifest.name;
        if (!name)
            throw `Cannot resolve AUTH from project configuration: missing 'name' property.`;

        if (envname === 'dev' || envname === 'test' || !config.manifest.version)
            bxspace = `${name}-${envname}`;
        else
            bxspace = `${name}-${envname}@${config.manifest.version}`;

        bxspace = utils.escapeNamespace(bxspace);
        config.logger.info(`targeting ${bxspace} space`);
    }

    const cred: bx.Credential = { org: bxorg, space: bxspace };
    await bx.login(config, cred);
    const auth = await bx.getAuthKeysForSpace(config, cred);
    props.set('AUTH', auth);
}

export async function getWskPropsFile(config: types.Config) {
    let wskprops = process.env.WSK_CONFIG_FILE;
    if (!wskprops || !fs.existsSync(wskprops)) {
        
        if (config.envname) {
            if (await setEnvironment(config, false))
                return getCachedEnvFilename(config);

            return null;
        }

        const until = path.dirname(expandHome('~'));
        let current = process.cwd();
        while (current !== '/' && current !== until) {
            wskprops = path.join(current, '.wskprops');

            if (fs.existsSync(wskprops))
                break;
            current = path.dirname(current);   
        }
    }
    return wskprops;
}

export async function readWskProps(config: types.Config) : Promise<IWskProps | null> {
    await init.init(config);
    const wskprops = await getWskPropsFile(config);
    if (wskprops) {
        const propertiesParser = require('properties-parser');
        try {
            return propertiesParser.read(wskprops);
        } catch (e) {
            return null;
        }
    }
    return null;
}

const auth = async (config: types.Config) => {
    const wskprops = await readWskProps(config)

    if (wskprops) {
        return {
            api_key: wskprops.AUTH,
            apihost: wskprops.APIHOST,
            ignore_certs: wskprops.IGNORE_CERTS || false,
            apigw_token: wskprops.APIGW_ACCESS_TOKEN
        }
    }

    return null
} 

// Resolve variables by merging command line options with .wskprops content
export async function resolveVariables(config: types.Config, options: any = {}) {
    await init.init(config);
    const wskprops = await readWskProps(config) || {}
    const variables: any = {}

    variables.auth = options.auth || process.env.WHISK_AUTH || wskprops.AUTH 
    variables.apihost = options.apihost || process.env.WHISK_APIHOST || wskprops.APIHOST 
    variables.ignore_certs = options.ignore_certs || process.env.WHISK_IGNORE_CERTS || wskprops.IGNORE_CERTS || false
    variables.apigw_token = options.apigw_token || process.env.WHISK_APIGW_ACCESS_TOKEN || wskprops.APIGW_ACCESS_TOKEN

    return variables
}

export async function initWsk(config: types.Config = {}, options = {}) {
    await init.init(config);
    const vars = await resolveVariables(config, options);
    init.setOW(config, openwhisk({ api_key: vars.auth, apihost: vars.apihost, ignore_certs: vars.ignore_certs, apigw_token: vars.apigw_token }));
    return config.ow;
}

function getCachedEnvFilename(config: types.Config) {
    return path.join(config.cache, 'envs', `.${config.envname}.wskprops`);
}