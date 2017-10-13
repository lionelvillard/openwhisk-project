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
import { Logger } from 'log4js';

export type YAML = any;

type Loader = (string) => Promise<Buffer>;

// --- Common command configuration 

export interface Config {
    flags?: any;                    // option flags.
     
    ow?: any;                       // OpenWhisk client. Perform a dry-run if not provided.
    dryrun?: boolean;               // dry run (false by default)

    manifest?: YAML | string;       // manifest used for deployment. Parsed or unparsed.
    location?: string;              // manifest location. Ignored if manifest is provided

    cache?: string;                 // cache location
    force?: boolean;                // perform update operation when true. Default is 'false'

    variableSources?: [VariableResolver];  // A list of variable resolvers. 

    logger_level?: string;          // logger level ('ALL', 'FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'OFF')
    logger?: Logger;                // logger

    load?: Loader;
    basePath?: string;
    envname?: string;                   // targeted environment name

    /* Set the command progress, e.g. loading foo.js */
    setProgress?: (format: string, options?) => void;

    /* Current progress. Use progress.tick for update */
    progress?: any;

    /* Internal */
    _initialized? : boolean;
}

export interface DeployConfig extends Config {
}

// --- Plugins

// OpenWhisk Plugin Interface 
export interface Plugin {

    // Action contributor returning a list of contributions to apply to the deployment configuration
    actionContributor?: ActionContributor;

    // API contributor returning a list of contributions to apply to the deployment configuration
    apiContributor?: ApiContributor;

    // service contributor returning a list of contributions to apply to the deployment configuration
    serviceContributor?: ServiceContributor;

    // Action builder contributor making the action artifacts to deploy.
    build?: ActionBuilder;

    // A variable resolver.
    resolveVariable?: VariableResolver;

}

export type ActionContributor = (Config, Project, pkgName: string, actionName: string, Action) => Contribution[];
export type ServiceContributor = (Config, pkgName: string, Package) => Contribution[];
export type ApiContributor = (Config, Project, apiname: string, Api) => Contribution[];
export type ActionBuilder = (Config, Action, Builder) => Promise<string>;
export type VariableResolver = (Config, name: string) => any;

// A contribution to the deployment configuration 
export type Contribution = ActionContribution | ApiContribution | PackageContribution;

// An action contribution
export interface ActionContribution {
    // kind of contribution
    kind: "action";

    // action package
    pkgName: string | null;

    // action name
    name: string;

    // action configuration
    body: Action;
}


// An package contribution
export interface PackageContribution {
    // kind of contribution
    kind: "package";

    // package name (or null-kind for default package)
    name: string;

    // package body
    body: Package;
}

// An api contribution
export interface ApiContribution {
    // kind of contribution
    kind: "api";

    // api name
    name: string;

    // api configuration
    body: Api;
}

// --- Project configuration format

// TODO!

export type Deployment = any
export type Project = Deployment
export type Action = any
export type Package = any
export type Api = any

export interface Builder {
    // name
    name: string;

    // build directory
    dir?: string;

    // builder options
    [key: string]: any;

    // The builder executor
    __exec?: ActionBuilder;
}

export enum projectProps { name = 'name', version = 'version', basepath = 'basePath', includes = 'includes', packages = 'packages', actions = 'actions', triggers = 'triggers', rules = 'rules', apis = 'apis', };
export enum actionProps {
    limits = 'limits', inputs = 'inputs', annotations = 'annotations', builder = 'builder',
    location = 'location', code = 'code', sequence = 'sequence', kind = 'kind', main = 'main',
    image = 'image', _qname = '_qname'
};