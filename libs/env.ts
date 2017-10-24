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
import * as semver from 'semver';

export interface IWskProps {
    APIHOST?: string,
    AUTH?: string,
    IGNORE_CERTS?: boolean,
    APIGW_ACCESS_TOKEN?: string,
    [key: string]: any
}

export interface IEnvPolicies {
    /* Environment name */
    name: string,

    /* Writable? */
    writable: boolean,

    /* Versioned? */
    versioned: boolean,

    /* What kind of entities the env manages */
    entities: string,

    /* Default wsk props */
    props?: IWskProps
}

// TODO: 
const BuiltinEnvs: IEnvPolicies[] = [
    { name: 'local', writable: true, versioned: false, entities: 'all', props: { APIHOST: '172.17.0.1' } },
    { name: 'dev', writable: true, versioned: false, entities: 'all', props: { APIHOST: 'openwhisk.ng.bluemix.net' } },
    { name: 'test', writable: true, versioned: false, entities: 'all', props: { APIHOST: 'openwhisk.ng.bluemix.net' } },
    { name: 'prod', writable: false, versioned: true, entities: 'all', props: { APIHOST: 'openwhisk.ng.bluemix.net' } },
    { name: 'api', writable: true, versioned: true, entities: 'api', props: { APIHOST: 'openwhisk.ng.bluemix.net', PRODVERSION: '1.0.0' } }];

const BuiltinEnvNames = BuiltinEnvs.map(e => e.name);
const ALL_WSKPROPS = '.all.wskprops';

export interface IEnvironment {
    policies: IEnvPolicies;
    versions: string[];
}

// Get all environments 
export async function getEnvironments(config: types.Config): Promise<IEnvironment[]> {
    const allpolicies = await getPolicies(config);
    const versions = await getVersions(config);

    return allpolicies.map(policies => ({ policies, versions: versions[policies.name] }));
}

export async function getPolicies(config: types.Config): Promise<IEnvPolicies[]> {
    config.logger.info('get environments policies');

    const toenvname = file => path.basename(file, '.wskprops').substr(1).toLowerCase();

    const ignore = (file, stats) => {
        if (stats.isDirectory())
            return true;
        const name = path.basename(file);
        return name === '.wskprops' || !name.endsWith('.wskprops') || BuiltinEnvNames.includes(toenvname(file));
    };

    try {
        const files: string[] = await readdir('.', [ignore]);
        return [...BuiltinEnvs, ...files.map(file => ({ name: toenvname(file), writable: false, versioned: false, entities: 'all' }))];
    } catch (e) {
        config.logger.error(e);
    }
    return [];
}

// Set current environment.
export async function setEnvironment(config: types.Config, persist: boolean = true) {
    const cached = await cacheEnvironment(config);
    if (persist) {
        const exists = await fs.pathExists('.wskprops');
        if (exists) {
            await fs.copy('.wskprops', '.wskprops.bak', { overwrite: true });
        }
        await fs.copy(cached, '.wskprops', { overwrite: true });
    }
}

async function cacheEnvironment(config: types.Config) {
    const name = config.envname;
    const version = config.version;
    config.setProgress(`refreshing ${name}${version ? `@${version}` : ''} cache`);

    const allPolicies = await getPolicies(config);
    const policies = allPolicies.find(v => v.name === name);
    if (!policies)
        throw `Environment ${name} does not exist`;

    config.logger.info(`environment policies:${JSON.stringify(policies)}`);
    if (!version && policies.versioned) {
        throw `Missing version for environment ${name}`;
    }

    // user-defined properties
    const filename = `.${name}.wskprops`;
    const exists = await fs.pathExists(filename);

    //  properties applicable to all environments
    const allExists = await fs.pathExists(ALL_WSKPROPS);

    // cached properties
    const cached = getCachedEnvFilename(config);
    await fs.mkdirs(path.dirname(cached));
    const cachedExists = await fs.pathExists(cached);

    const refreshCache = async () => {
        const props = propertiesParser.createEditor(ALL_WSKPROPS);
        addAll(props, propertiesParser.read(filename));
        await resolveProps(config, name, version, filename, props);
        props.save(cached);
    }

    if (cachedExists) {
        if (exists) {
            // Just check cache is up-to-date
            const stat1 = await fs.stat(filename);
            const stat2 = await fs.stat(ALL_WSKPROPS);
            const stat3 = await fs.stat(cached);
            if (stat1.ctimeMs > stat3.ctimeMs || stat2.ctimeMs > stat3.ctimeMs) {
                await refreshCache();
            }
        } else {
            // no user-defined properties, so cached values are fine.
        }

    } else {
        // No cached properties.

        if (!exists) {
            // It's a builtin environment => generate.
            await newEnvironment(config, name, policies.props);
        }

        await refreshCache();
    }


    config.progress.terminate();
    return cached;
}

// Create new environment
export async function newEnvironment(config: types.Config, name: string, wskprops: IWskProps) {
    const filename = `.${name}.wskprops`;
    if (await fs.pathExists(filename))
        throw `Environment ${name} already exists`;

    const props = propertiesParser.createEditor();
    Object.keys(wskprops).forEach(key => props.set(key, wskprops[key]));
    console.log(props)
    props.save(filename);
}

// Increment project version
export async function incVersion(config: types.Config, releaseType: semver.ReleaseType) {
    if (!['major', 'premajor', 'minor', 'preminor', 'patch', 'prepatch', 'prerelease'].includes(releaseType))
        throw `${releaseType} is not a valid release type`;

    let version = config.manifest.version || '0.1.0';
    version = semver.inc(version, releaseType);

    let content = await fs.readFile(config.location, 'utf-8');

    if (config.manifest.version) {
        content = content.replace(/(version[^:]*:).*/, `$1 ${version}`);
    }

    await fs.writeFile(config.location, content, { encoding: 'utf-8' })
}


async function resolveProps(config: types.Config, env: string, version: string, filename: string, props) {
    config.logger.info('resolve wsk properties');
    const apihost = props.get('APIHOST');
    if (!apihost) {
        throw `missing APIHOST in ${filename}`;
    }

    if (!props.get('AUTH') || !props.get('APIGW_ACCESS_TOKEN')) {
        if (apihost.endsWith('bluemix.net')) {
            await resolveAuthFromBluemix(config, props, env, version);
        } else {
            throw 'cannot resolve AUTH';
        }
    }
}

async function resolveAuthFromBluemix(config: types.Config, props, env: string, version: string) {
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

        if (version)
            bxspace = `${name}-${env}@${version}`;
        else
            bxspace = `${name}-${env}`;

        bxspace = escapeNamespace(bxspace);
        config.logger.info(`targeting ${bxspace} space`);
    }

    const cred: bx.Credential = { org: bxorg, space: bxspace };
    await bx.login(config, cred);
    const wskprops = await bx.getWskPropsForSpace(config, cred);

    if (!wskprops.AUTH)
        throw `missing AUTH in .wskprops`;
    if (!wskprops.APIGW_ACCESS_TOKEN)
        throw `missing APIGW_ACCESS_TOKEN in .wskprops`;

    props.set('AUTH', wskprops.AUTH);
    props.set('APIGW_ACCESS_TOKEN', wskprops.APIGW_ACCESS_TOKEN);
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

export async function readWskProps(config: types.Config): Promise<IWskProps | null> {
    const wskprops = await getWskPropsFile(config);
    if (wskprops) {
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

    return null;
}

// Resolve variables by merging command line options with .wskprops content
export async function resolveVariables(config: types.Config, options: any = {}) {
    const wskprops = await readWskProps(config) || {};
    const variables: any = {};

    variables.auth = options.auth || process.env.WHISK_AUTH || wskprops.AUTH;
    variables.apihost = options.apihost || process.env.WHISK_APIHOST || wskprops.APIHOST;
    variables.ignore_certs = options.ignore_certs || process.env.WHISK_IGNORE_CERTS || wskprops.IGNORE_CERTS || false;
    variables.apigw_token = options.apigw_token || process.env.WHISK_APIGW_ACCESS_TOKEN || wskprops.APIGW_ACCESS_TOKEN;

    return variables
}

export async function initWsk(config: types.Config = {}, options = {}) {
    const vars = await resolveVariables(config, options);
    return openwhisk({ api_key: vars.auth, apihost: vars.apihost, ignore_certs: vars.ignore_certs, apigw_token: vars.apigw_token });
}

function getCachedEnvFilename(config: types.Config) {
    return path.join(config.cache, 'envs', `.${config.envname}${config.version ? `@${config.version}` : ''}.wskprops`);
}

// Convert env name to valid namespace
function escapeNamespace(str: string) {
    // The first character must be an alphanumeric character, or an underscore.
    // The subsequent characters can be alphanumeric, spaces, or any of the following: _, @, ., -
    return str.replace(/[+]/g, '-');
}

function addAll(props, others) {
    Object.keys(others).forEach(key => props.set(key, others[key]));
}

// Retrieve all versions for all environment
async function getVersions(config: types.Config) {
    if (!await bx.isBluemixCapable())
        throw 'bx is not installed';

    const name = config.manifest.name;

    const devCfg = { ...config };
    devCfg.envname = 'dev';
    const dev = await cacheEnvironment(devCfg);
    const props = propertiesParser.read(dev);

    // TODO: support for multiple org    
    if (props.BLUEMIX_ORG) {
        const cred = { org: props.BLUEMIX_ORG, space: `${name}-dev` };
        config.setProgress('getting environment versions');
        const io = await bx.run(config, cred, 'iam spaces');
        const stdout: string = io.stdout;
        const regex = new RegExp(`${name}-([\\w]+)@([\\w\\d.]+)`, 'g');
        
        const versions = {};
        let match;
        while ((match = regex.exec(stdout)) !== null) {
            const env = match[1];
            if (!versions[env])
                versions[env] = [];
            versions[env].push(match[2]);
        }
        return versions;
    }
    return [];
} 