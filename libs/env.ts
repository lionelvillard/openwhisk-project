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
import * as auth from './auth';
import * as bx from './bluemix';
import * as utils from './utils';
import * as readdir from 'recursive-readdir';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as propertiesParser from 'properties-parser';
import * as expandHome from 'expand-home-dir';

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
export async function setEnvironment(config: types.Config, envname: string) {
    await init.init(config);
    config.logger.info(`set project environment to ${envname}`);
    const filename = `.${envname}.wskprops`;
    let exists = await fs.pathExists(filename);
    if (!exists)
        return false

    exists = await fs.pathExists('.wskprops');
    if (exists) {
        await fs.copy('.wskprops', '.wskprops.bak', { overwrite: true });
    }
    await fs.copy(filename, '.wskprops', { overwrite: true });

    // Check and resolve
    resolveProps(config, envname);

    return true;
}

async function resolveProps(config: types.Config, envname: string) {
    const props = propertiesParser.createEditor('.wskprops');
    
    const apihost = props.get('APIHOST');
    if (!apihost) {
        config.logger.fatal('missing APIHOST in .wskprops');
        throw 'missing APIHOST in ./.wskprops';
    }

    if (!props.get('AUTH')) {
        if (apihost.endsWith('bluemix.net')) {
            await resolveAuthFromBluemix(config, props, envname);
        } else {
            config.logger.fatal('cannot resolve AUTH');
            throw 'cannot resolve AUTH';
        }
        
        props.save('.wskprops');
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

    const cred: bx.Credential = { org: bxorg, space: bxspace, home: expandHome('~') };
    await bx.login(config, cred);
    const auth = await bx.getAuthKeysForSpace(config, cred);
    props.set('AUTH', auth);
}

