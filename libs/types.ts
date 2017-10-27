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

export type Phase = 'validation'; 

// --- Common command configuration 

export interface Config {
    /** What phases to skip */
    skipPhases?: Phase[];     
    
    /** Option flags */
    flags?: any;     
    
    /** logger level ('ALL', 'FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE', 'OFF') */
    logger_level?: string;          

    /** Logger instance */
    logger?: Logger;         

    /** OpenWhisk client. */
    ow?: any;            
    
    /** Dry run operation */
    dryrun?: boolean;       

    /** Absolute base path */
    basePath?: string;
    
    /** Project configuration location. Might be null */
    location?: string;              
    
    /** Project configuration. Parsed or unparsed. */
    manifest?: YAML | string;       
    
    /** Cache location */
    cache?: string;                 

    /** During deployment, whether to create or update resources. Defaut is false */
    force?: boolean;                

    /* A list of variable resolvers */
    variableSources?: [VariableResolver];   

    /** Application name. Must match manifest.name when not null */
    appname?: string;                  

    /** Environment name. When null, fallback to basic wsk behavior */
    envname?: string;                  

    /** Environment version. Null when given environment does not support versioning. Should match manifest.version */
    version?: string;                  
    
    // --- Progress management

    /* Start progress, e.g. loading foo.js. Can be nested. */
    startProgress?: (format?: string, options?) => void;

    /* Terminate current progress (if any) */
    terminateProgress?: () => void;
    
    /* Set current progress, e.g. loading foo.js */
    setProgress?: (format?: string, options?) => void; 
    
    /* Clear all progresses */
    clearProgress?: () => void;
    
    /* Current progress. Use `progress.tick` for update */
    progress?: any;

    // ---- Error management

    /** throw fatal error */
    fatal? : (format, ...args) => never; 

    // ---- Internal

    /* Is config already initialized */
    _initialized? : boolean;

    /* current progress formats and options */
    _progresses? : { format: string, options: any }[];

    // deprecated
    load?: Loader;
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

    // A variable resolver creator.
    resolveVariableCreator?: VariableResolverCreator;

}

export type ActionContributor = (Config, Project, pkgName: string, actionName: string, Action) => Contribution[];
export type ServiceContributor = (Config, pkgName: string, Package) => Contribution[];
export type ApiContributor = (Config, Project, apiname: string, Api) => Contribution[];
export type ActionBuilder = (Config, Action, Builder) => Promise<string>;
export type VariableResolver = (name: string) => any;
export type VariableResolverCreator = (Config) => Promise<(name: string) => any>;

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

export enum projectProps { name = 'name', version = 'version', basepath = 'basePath', dependencies = 'dependencies', packages = 'packages', actions = 'actions', triggers = 'triggers', rules = 'rules', apis = 'apis', };
export enum actionProps {
    limits = 'limits', inputs = 'inputs', annotations = 'annotations', builder = 'builder',
    location = 'location', code = 'code', sequence = 'sequence', kind = 'kind', main = 'main',
    image = 'image', _qname = '_qname'
};