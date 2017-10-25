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
    { name: 'api', writable: true, versioned: false, entities: 'api', props: { APIHOST: 'openwhisk.ng.bluemix.net', PRODVERSION: '1.0.0' } }];

const BuiltinEnvNames = BuiltinEnvs.map(e => e.name);
const ALL_WSKPROPS = '.all.wskprops';

export interface IEnvironment {
    policies: IEnvPolicies;
    versions: string[];
}

// Get properties in current environment
export async function getCurrent(config: types.Config) {
    const subcfg = { ...config };
    delete subcfg.envname;
    return await readWskProps(subcfg);
}


// Get all environments along with versioms
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
export async function setEnvironment(config: types.Config) {
    const cached = getCachedEnvFilename(config);
    const exists = await fs.pathExists('.wskprops');
    if (exists) {
        await fs.copy('.wskprops', '.wskprops.bak', { overwrite: true });
    }
    await fs.copy(cached, '.wskprops', { overwrite: true });
    return true;
}

// Refresh cached resolved environments, if needed and prepare backend.
export async function cacheEnvironment(config: types.Config) {
    config.startProgress('checking cache up-to-date');

    await isValid(config);
    const name = config.envname;
    const version = config.version;
    
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
        config.logger.debug('refreshing cache')
        const props = propertiesParser.createEditor(allExists ? ALL_WSKPROPS : '');
        addAll(props, propertiesParser.read(filename));
        await resolveProps(config, name, version, filename, props);
        props.save(cached);
    }

    if (cachedExists) {
        config.logger.debug('cache file exists');

        if (exists) {
            // Just check cache is up-to-date
            const stat1 = await fs.stat(filename);
            const stat2 = allExists ? await fs.stat(ALL_WSKPROPS) : null;
            const stat3 = await fs.stat(cached);
            if (stat1.ctimeMs > stat3.ctimeMs || (stat2 && stat2.ctimeMs > stat3.ctimeMs)) {
                await refreshCache();
            }
        } else {
            // no user-defined properties, so cached values are fine.
        }
    } else {
        config.logger.debug('cache file does not exist');
        // No cached properties.

        if (!exists) {
            // It's a builtin environment => generate. (or error?)
            const allPolicies = await getPolicies(config);
            const policies = allPolicies.find(v => v.name === name);
            await newEnvironment(config, name, policies.props);
        }

        await refreshCache();
    }

    await readiedBackend(config, cached);

    config.terminateProgress();
    return cached;
}

// Create new environment from template
export async function newEnvironment(config: types.Config, name: string, wskprops: IWskProps) {
    config.logger.info(`creating environment ${name}`);
    const filename = `.${name}.wskprops`;
    if (await fs.pathExists(filename))
        throw `environment ${name} already exists`;

    const props = propertiesParser.createEditor();
    Object.keys(wskprops).forEach(key => props.set(key, wskprops[key]));
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

// Promote API environment to latest PROD
export async function promote(config: types.Config) {
    const versions = await getVersions(config);
    if (versions && versions['prod'] && versions['prod'].length > 0) {
        const prods = versions['prod'];
        const latest = prods[prods.length - 1];

        if (!(await fs.pathExists('.api.wskprops')))
            await newEnvironment(config, 'api', BuiltinEnvs.find(obj => obj.name === 'api').props);

        let content = await fs.readFile('.api.wskprops', 'utf-8');
        content = content.replace(/(PRODVERSION[^=]*=).*/, `$1${latest}`);
        await fs.writeFile('.api.wskprops', content, { encoding: 'utf-8' });
        return true;
    }
    return false;
}

// --- Helpers

async function resolveProps(config: types.Config, env: string, version: string, filename: string, props) {
    config.logger.info('resolve wsk properties');
    let apihost = props.get('APIHOST');
    if (!apihost) {
        config.logger.info('no api host. Use default openwhisk.ng.bluemix.net');
        apihost = 'openwhisk.ng.bluemix.net';
        props.set('APIHOST', apihost);
    }

    if (!props.get('AUTH') || !props.get('APIGW_ACCESS_TOKEN')) {
        if (apihost.endsWith('bluemix.net')) {
            await resolveAuthFromBluemix(config, props, env, version);
        } else {
            config.fatal('no AUTH variable found');
        }
    }
}

async function resolveAuthFromBluemix(config: types.Config, props, env: string, version: string) {
    if (!bx.isBluemixCapable())
        config.fatal('bx is not installed');

    let bxorg = process.env.BLUEMIX_ORG || props.get('BLUEMIX_ORG');
    if (!bxorg)
        config.fatal('cannot resolve AUTH and APIGW_ACCESS_TOKEN from Bluemix credential: missing BLUEMIX_ORG');

    let bxspace = process.env.BLUEMIX_SPACE || props.get('BLUEMIX_SPACE');
    bxspace = bxspace ? bxspace.trim() : null;
    if (!bxspace) {
        if (!config.appname)
            config.fatal(`cannot resolve AUTH: missing application name.`);

        if (version)
            bxspace = `${config.appname}-${env}@${version}`;
        else
            bxspace = `${config.appname}-${env}`;

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

    props.set('APPNAME', config.appname);
    props.set('ENVNAME', env);
    if (version)
        props.set('ENVVERSION', version);
    props.set('BLUEMIX_ORG', bxorg);
    props.set('BLUEMIX_SPACE', bxspace);
    props.set('AUTH', wskprops.AUTH);
    props.set('APIGW_ACCESS_TOKEN', wskprops.APIGW_ACCESS_TOKEN);
}

export async function getWskPropsFile(config: types.Config) {
    let wskprops = process.env.WSK_CONFIG_FILE;
    if (!wskprops || !fs.existsSync(wskprops)) {
        if (config.envname)
            return getCachedEnvFilename(config);

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
            config.logger.info(`reading ${wskprops}`);
            return propertiesParser.read(wskprops);
        } catch (e) {
            return null;
        }
    }
    config.logger.info('no wskprops found');
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

    return variables;
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

// Retrieve all versions for all environments
async function getVersions(config: types.Config) {
    if (!await bx.isBluemixCapable())
        config.fatal('cannot get the versions associated to the environments: bx is not installed');

    config.startProgress('getting environment versions');

    if (!config.appname)
        config.fatal('cannot get the versions associated to the environments: missing application name');

    const props = await readWskProps(config);
    const versions = {};
    // TODO: support for multiple orgs    
    if (props.BLUEMIX_ORG) {
        const cred = { org: props.BLUEMIX_ORG, space: props.BLUEMIX_SPACE };
        await bx.login(config, cred);
        const io = await bx.run(config, cred, 'iam spaces'); // long! Consider caching result
        const stdout = io.stdout;
        const regex = new RegExp(`${config.appname}-([\\w]+)@([\\w\\d.]+)`, 'g');

        let match;
        while ((match = regex.exec(stdout)) !== null) {
            const env = match[1];
            if (!versions[env])
                versions[env] = [];
            versions[env].push(match[2]);
        }
    }
    config.terminateProgress();

    return versions;
}

async function readiedBackend(config: types.Config, wskpropsFile: string) {
    const wskprops = propertiesParser.createEditor(wskpropsFile);

    if (wskprops.get('APIHOST').endsWith('.bluemix.net')) {
        const cred: bx.Credential = { org: wskprops.get('BLUEMIX_ORG'), space: wskprops.get('BLUEMIX_SPACE') };
        bx.fixupCredentials(config, cred);
        await bx.ensureSpaceExists(config, cred);

        // Patch APIGW_ACCESS_TOKEN
        const bxwskprops = propertiesParser.read(`${cred.home}/.wskprops`);
        if (wskprops.get('APIGW_ACCESS_TOKEN') !== bxwskprops.APIGW_ACCESS_TOKEN) {
            wskprops.set('APIGW_ACCESS_TOKEN', bxwskprops.APIGW_ACCESS_TOKEN);
            wskprops.save();
        }
    }
}

async function isValid(config: types.Config) {
    const name = config.envname;
    const version = config.version;

    // no cache for envname. Check it's valid 
    const allpolicies = await getPolicies(config);
    const policies = allpolicies.find(policies => policies.name === name);
    if (!policies)
        config.fatal('environment %s does not exist', name);

    if (!policies.versioned && version)
        config.fatal('environment %s  does not support versioning', name);

    if (policies.versioned && !version) {
        // get app version
        if (config.manifest)
            config.version = config.manifest.version;

        if (!config.version)
            config.fatal('missing version');
    }
}

export function parseEnvName(envname: string) {
    const matched = envname.match(/^([\w]*)(@(.+))?$/);
    if (matched) {
        const version = matched[3];
        if (version && !semver.valid(version))
            throw `Malformed environment version ${version}`;
        return { name: matched[1], version };
    }
    throw `Malformed environment name ${envname}`;
}