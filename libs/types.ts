export type ProjectContributor = (IConfig, IProject) => Contribution[] | Promise<Contribution[]>;
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

export type Loader = (string) => Promise<Buffer>;

export type Phase = 'validation';

// --- Common command configuration

export type Config = IConfig;
export interface IConfig {
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

    /** Project name. Must match manifest.name when not null */
    projectname?: string;

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
    fatal?: (format, ...args) => never;

    // ---- Internal

    /* Is config already initialized */
    _initialized?: boolean;

    /* current progress formats and options */
    _progresses?: { format: string, options: any }[];

    // deprecated
    load?: Loader;
}

// --- Plugins

// OpenWhisk Plugin Interface
export type Plugin = IPlugin;
export interface IPlugin {

    // Action contributor (/actions, packages/<name>/actions)
    actionContributor?: ActionContributor;

    // API contributor (/api)
    apiContributor?: ApiContributor;

    // service contributor (/services/<name>/type: <type>)
    serviceContributor?: ServiceContributor;

    // service binding contributor (/packages/<name>/service: <name>)
    serviceBindingContributor?: ServiceBindingContributor;

    // Action builder contributor making the action artifacts to deploy.
    build?: ActionBuilder;

    // A variable resolver creator.
    resolveVariableCreator?: VariableResolverCreator;

    // Syntax contributor returning a list of syntax contributions
    syntaxContributor?: SyntaxContributor;

    // Plugin name (internal)
    __pluginName?: string;
}

export type SyntaxContributor = (IConfig, name: string, value: any) => ISyntaxContribution[];

export type ActionContributor = (IConfig, IProject, pkgName: string, actionName: string, IAction) => Contribution[] | Promise<Contribution[]>;
export type ServiceContributor = (IConfig, string, IService) => Contribution[];
export type ServiceBindingContributor = (IConfig, pkgName: string, IPackage) => Contribution[];
export type ApiContributor = (IConfig, IProject, apiname: string, IApi) => Contribution[] | Promise<Contribution[]>;
export type ActionBuilder = (IConfig, IAction, Builder) => string | Promise<string>;
export type VariableResolver = (name: string) => any;
export type VariableResolverCreator = (Config) => Promise<(name: string) => any>;

// A contribution to the project configuration
export type IContribution = Contribution;
export type Contribution = IActionContribution | IApiContribution | IPackageContribution | IServiceContribution;

// A syntax contribution
export interface ISyntaxContribution {
    // kind of contribution
    kind: 'syntax';

    // The path pointing to the object where to insert the contribution
    path: string;

    // The property name
    name: string;

    // contribution body
    body: any;
}

// An action contribution
export interface IActionContribution {
    // kind of contribution
    kind: 'action';

    // action package
    pkgName: string | null;

    // action name
    name: string;

    // action configuration
    body: IAction;
}

// An package (including package binding) contribution
export interface IPackageContribution {
    // kind of contribution
    kind: 'package';

    // package name (or null-kind for default package)
    name: string;

    // package body
    body: IPackage;
}

// An api contribution
export interface IApiContribution {
    // kind of contribution
    kind: 'api';

    // api name
    name: string;

    // api configuration
    body: IApi;
}

// A service contribution
export interface IServiceContribution {
    // kind of contribution
    kind: "service";

    // service id
    id: string;

    // service configuration
    body: IResource;
}

// --- Project configuration format

// TODO!

export interface IProject {
    /* Project name  */
    name?: string;

    /* Target namespace  */
    namespace?: string;

    /* Project version */
    version?: string;

    /* Base path. Relative path are resolved against it  */
    basePath?: string;

    /* External resources */
    resources?: Array<{[key: string]: IResource}>;

    /* Dependencies */
    dependencies?: Array<{[key: string]: any}>;

    /* OpenWhisk packages */
    packages?: {[key: string]: any};

    /* OpenWhisk action in default package */
    actions?: {[key: string]: any};

    /* OpenWhisk apis */
    apis?: {[key: string]: any};

    /* OpenWhisk triggers */
    triggers?: {[key: string]: any};

    /* OpenWhisk rules */
    rules?: {[key: string]: any};
}

export type IAction = any;
export type IPackage = any;
export type IApi = any;

export interface IResource {
    /* Service name. By default same as service id */
    name?: string;

    /* Service type */
    type: string;

    // service parameters
    [key: string]: any;
}

export interface IBuilder {
    // name
    name: string;

    // build directory
    dir?: string;

    // builder options
    [key: string]: any;

    // The builder executor
    __exec?: ActionBuilder;
}

export enum ProjectProps {
    name = 'name', version = 'version', basePath = 'basePath', dependencies = 'dependencies',
    packages = 'packages', actions = 'actions', triggers = 'triggers', rules = 'rules', apis = 'apis',
    namespace = 'namespace'
}

export enum ActionProps {
    limits = 'limits', inputs = 'inputs', annotations = 'annotations', builder = 'builder',
    location = 'location', code = 'code', sequence = 'sequence', kind = 'kind', main = 'main',
    image = 'image', _qname = '_qname'
}
