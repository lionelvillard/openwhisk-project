# Deployment Configuration Specification

This document formally describe the project configuration format.

## Notation

This document uses [Markdown Syntax for Object Notation](https://github.com/apiaryio/mson/blob/master/MSON%20Specification.md) to describe the JSON schema
constraining project description.

## `project` (top-level schema)

A *project* is an `object` representing a collection of OpenWhisk entities (actions, packages, rules, triggers and apis)
and related resources. It also contains metadata, such as `name` and `version`.

### Properties

- `name` (string, optional) : the name associated to the entities described in the deployment. When set, do not change this without proper review as commands like `undeploy` may not work as expected.

  When specified, deployed entities are *fully managed*.

  *Unmanaged* entities are entities deployed using a tool other than `fsh`, such as `wsk`.

  *Partially managed* entities are entities described in deployment files and deployed using `fsh`.

  Compare to partially managed entities, fully managed deployments provide these additional guarantees:
  - during deployment:
     - entities removed from deployment files are also undeployed
     - external (not managed by this deployment) entities are not overwritten. (Conflict detection)
  - during undeployment:
     - all entities are undeployed, independently of changes in deployment files.

  Internally, a fully managed entity contains the annotation called `managed`.

- `basePath` (string, optional): the relative or absolute base path used to resolve relative location.

- `version` (string, optional): project version following semver format.

- [`dependencies`](#dependencies) (array, optional): includes external project configurations
- [`resources`](#resources) (array, optional): related resources
- [`packages`](#packages) (object, optional)
- [`actions`](#actions) (object, optional)
- [`triggers`](#triggers) (object, optional)
- [`rules`](#rules) (object, optional)
- [`apis`](#apis) (object, optional)
- [`environments`](#environment) (object, optional): project environments

### Example

```yaml
name: example
version: 0.1.0
basePath: .

dependencies:  # includes other project configuration
actions:   # actions in the default package
packages:  # actions in packages and package bindings
triggers:
rules:
apis:
```

## `dependencies`

An *array* of `dependency` *objects*.

## `dependency`

A `object` representing an external project configuration.

Limitation: nested `dependencies` are currently not supported.

### Properties

- `location` (string, required): the URL to the dependent project configuration file.

   Supported format:
     - git: `git+<protocol>://[<user>[:<password>]@]<hostname>[:<port>][:][/]<path>#<commit-ish>`, where `protocol` is one of `ssh`, `http`, `https`, or `file`. See [here](https://www.kernel.org/pub/software/scm/git/docs/gitrevisions.html#_specifying_revisions) for support commit-ish formats.
     - file: `./<path>` or `/<path>`

### Example

```yaml
dependencies:
  - location: git+https://github.com/lionelvillard/openwhisk-deploy.git/project.yaml#master
```

## `resources`

An array of `resource` `object`s

## `resource`

An `object` representing a resource.

### Properties


## `packages`

An `object` representing a list of packages. Package name must be unique among the set of package names within a namespace

### Properties

- *package-name* ([`binding`](#binding) | [`packageContent`](#packageContent) | [`interpolation`](#interpolation), optional)

## `binding`

An `object` representing a package binding

### Properties

- `bind` (string, required): the name of the package to bind
- `inputs` ([`parameters`](#parameters), optional): binding parameters
- `annotations` ([`annotations`](#annotations), optional)
- `publish` (boolean, optional, default: false): indicate whether the package is public or private

### Example

```yaml
packages:
  utils-binding:
    bind: /whisk.system/utils
```
## `packageContent`

An `object` representing the content of a package.

### Properties

- [`actions`](#actions) (object, optional): a list of actions
- `inputs` ([`parameters`](#parameters), optional): package parameters
- `annotations` ([`annotations`](#annotations), optional)
- `publish` (boolean, optional, default: false): indicate whether the package is public or private

## `actions`

An `object` representing a list of `action`s.

Actions can be specified in any order, e.g. actions composing sequences can be specified after sequences.
An error is raised when a cyclic dependency is detected.

### Properties

- *action-name* ([`action`](#action) | [`sequence`](#sequence) | [`copy`](#copy) | [`inline`](#inline), optional)

  where *action-name* must be [unqualified](https://github.com/apache/incubator-openwhisk/blob/master/docs/reference.md#fully-qualified-names)
  and must be unique among the list of action names.


## `action`

An `object` representing an action. Extends [`baseAction`](#baseaction)

### Properties

- `location` (string, required): the action code location. Either a folder or a file.

   Relative paths are resolved by using the in-scope `basePath` value.

- `kind` (enum, optional): the action kind. Determined automatically (see below)

  | Actual kind | Specified Kind | Default When |
  |----------------|-------------|--------------|
  | [nodejs:6](https://github.com/apache/incubator-openwhisk/blob/master/docs/reference.md#javascript-runtime-environments) | nodejs <br/> nodejs:6 <br/> nodejs:default |file extension is `.js` <br/> file name is `package.json` </br> folder contains `package.json`|
  | [python:2](https://github.com/apache/incubator-openwhisk/blob/master/docs/reference.md#python-2-actions)  | python <br/> python:2 | file extension is `.py`
  | [python:3](https://github.com/apache/incubator-openwhisk/blob/master/docs/reference.md#python-3-actions)  | python:3 |
  | [java](https://github.com/apache/incubator-openwhisk/blob/master/docs/actions.md#creating-and-invoking-an-action-1) | java | file extension is `.jar` <br/> |
  | [php:7.1](https://github.com/apache/incubator-openwhisk/blob/master/docs/actions.md#creating-and-invoking-an-action-1) | php <br/> php:7.1 | file extension is `.php` <br/> |
  | [swift:3.1.1](https://github.com/apache/incubator-openwhisk/blob/master/docs/reference.md#swift-actions) | swift <br/> swift:3.1.1 | file extension is `.swift` |
  | [swift:3](https://github.com/apache/incubator-openwhisk/blob/master/docs/reference.md#swift-actions) | swift <br/> swift:3 |   |
  | [docker](https://github.com/apache/incubator-openwhisk/blob/master/docs/actions.md#creating-docker-actions) | blackbox | file  is `Dockefile` <br/> folder contains `Dockerfile` <br/> action has `image` property |

- `main` (string, optional): the action entry point. Only valid for [Java](https://github.com/apache/incubator-openwhisk/blob/master/docs/actions.md#creating-java-actions) (no default), [PHP](https://github.com/apache/incubator-openwhisk/blob/master/docs/actions.md#creating-and-invoking-a-php-action) (default is `main`) and [Python](https://github.com/apache/incubator-openwhisk/blob/master/docs/actions.md#creating-and-invoking-a-python-action) (default is `main`).

- `image` (string, optional): a docker image.

### Extensions

- [package](https://github.com/lionelvillard/openwhisk-project/blob/master/plugins/wskp-package-plugin/README.md): zip builder.

- [web](https://github.com/lionelvillard/openwhisk-project/blob/master/plugins/wskp-web-plugin/README.md): syntactic sugar for configurating Web actions.

- [combinator](https://github.com/lionelvillard/openwhisk-project/blob/master/plugins/actions/combinator/README.md): syntactic sugar for the [combinator package](https://github.com/apache/incubator-openwhisk-catalog/tree/master/packages/combinators).


### Examples

#### sequence

```yaml
packages:
  utils:
    actions:
      cat:
        location: cat.js
        kind: nodejs
      mysequence:
        sequence: /whisk.system/utils/echo, /whisk.system/utils/cat
```

#### docker

```yaml
actions:
  docker-action:
    image: openwhisk/dockerskeleton
```

## `copy`

An `object` representing an action to copy.

Extends [`baseAction`](#baseaction)

### Properties

- `copy` (string, optional): the name of the action to copy. Subject to [naming resolution](#entity-name-resolution)

    Copy `parameters`, `annotations`, `limits` and the action executable content.
    Can be overridden or extended with [`inputs`](#parameters), [`annotations`](#annotations), [`limits`](#limits)

    The action to copy can either be locally defined (in the same manifest)
    or already deployed.


### Example

```yaml
packages:
  utils:
    actions:
      mycat:  # Copy deployed 'cat' action
        copy: /whisk.system/utils/cat
        inputs:
          lines: Hello Gentle World

      mycat2: # Copy locally defined 'mycat' action
        copy: mycat
```

## `inline`

An `object` representing an action with inlined code.

Extends [`baseAction`](#baseaction)

### Properties

- `code` (string, required): the action textual code.
- `kind` ([`baseAction`](#baseaction) enum, required): the required action kind

### Example

```yaml
packages:
  utils:
    actions:
      myecho:
        kind: nodejs
        code: |
          function main(params) {
            console.log(params);
            return params || {};
          }
```
## `sequence`

An `object` representing a sequence action. Extends [`baseAction`](#baseaction)

### Properties

- `sequence` (string, required): a comma-separated list of action names.

   Non-fully qualified action names are resolved as described [here](#entity-name-resolution)


### Example

```yaml
packages:
  utils:
    actions:
      mysequence:
        sequence: /whisk.system/utils/echo, /whisk.system/utils/cat
```

## `baseAction`

A common set of action properties.

### properties

- `limits` ([`limits`](#limits), optional): the action limits
- `inputs` ([`parameters`](#parameters), optional): action parameters
- `annotations` ([`annotations`](#annotations), optional)

  Builtin annotations:
  - [`web-export`](https://github.com/apache/incubator-openwhisk/blob/master/docs/webactions.md) (true|false): enable/disable web action
  - [`raw-http`](https://github.com/apache/incubator-openwhisk/blob/master/docs/webactions.md#raw-http-handling) (true|false): enable/disable raw HTTP handling

- `builder` ([`builder`](#builder), optional): the action builder.

## `triggers`

An `object` representing a list of `trigger`s.

### Properties

- *trigger-name* (`object`, [`trigger`](#trigger)|[`feed`](#feed), optional)

## `trigger`

An `object` representing a trigger.

## Properties

- `inputs` ([`parameters`](#parameters), optional): trigger parameters
- `annotations` ([`annotations`](#annotations), optional)
- `publish` (boolean, optional, default: false): indicate whether the package is public or private

## `feed`

An `object` representing a feed.

## Properties

- `feed` (string, required): a feed name
- `inputs` ([`parameters`](#parameters), optional): feed parameters
- `annotations` ([`annotations`](#annotations), optional)
- `publish` (boolean, optional, default: false): indicate whether the package is public or private

### Example

```yaml
triggers:
  # Trigger named "image-uploaded"
  # Creating trigger to fire events when data is inserted
  image-uploaded:
    feed: openwhisk-cloudant/changes
    inputs:
      dbname: ${vars.CLOUDANT_DATABASE}
```

## `rules`

An `object` representing a list of `rule`s.

### Properties

- *rule-name* (`object`, [`rule`](#rule), optional)

## `rule`

An `object` representing a rule.

### Properties

- trigger (string, required): the trigger name. Resolved as described [here](#entity-name-resolution)
- action (string, required): the action name. Resolved as described [here](#entity-name-resolution)
- status (enum `active`|`inactive`, optional): whether the rule is `active` or `inactive`. Default is `active`

### Example

```yaml
rules:
  # Rule named "echo-images"
  # Creating rule that maps database change trigger to sequence
  echo-images:
    trigger: image-uploaded
    action: write-from-cloudant-sequence
```

## `apis`

An `object` representing a list of `api`s.

### Properties

- *apiname* (`object`, [`api`](#api), optional):

## `api`

An `object` representing an api. The format loosely follows the [OpenAPI](https://www.openapis.org/) format.

### Properties

- basePath (string, required): the API base path. LIMITATION: currently it **must** be the same as the api name
- paths ([`apiPaths`](#apiPaths), optional): the list of relative paths

**Plugin extensions**:
- [`swagger`](https://github.com/lionelvillard/openwhisk-project/blob/master/plugins/core/wskp-swagger-plugin/README.md): describes routes in Swagger.

### Example

```yaml
apis:
  /hello:
    basePath: /hello
    paths:
      /world:
        get: hello
```

## `apiPaths`

An `object` representing a list of relative api `path`s.

### Properties

- *relpath* (object, [`apiPath`](#apiPath), optional):

## `apiPath`

An `object` representing a path.

### Properties

- `get` (string, optional): the action name of the GET operation
- `put` (string, optional): the action name of the PUT operation
- `post` (string, optional): the action name of the POST operation
- `delete` (string, optional): the action name of the DELETE operation
- `options` (string, optional): the action name of the OPTIONS operation
- `head` (string, optional): the action name of the HEAD operation
- `patch` (string, optional): the action name of the PATCH operation

## `parameters`

An `object` representing a list of parameters

### Properties

- *key* (string | [`interpolation`](#interpolation), optional)

### Example

Action parameters:

```yaml
packages:
  utils:
    actions:
      cat:
        location: cat.js
        inputs:
          mykey: myvalue
```

## `annotations`

An `object` representing a list of annotations.

### Properties

- `{key}` (string | [`interpolation`](#interpolation), optional)

## `limits`

An `object` representing action limits

### Properties

- `memory` (integer, optional, default: 256): the maximum memory limit in MB for the action
- `logsize` (integer, optional, default:10): the maximum log size limit in MB for the action
- `timeout` (integer, optional, default:60000): the timeout limit in milliseconds after which the action is terminated

### Properties

- `plugin` (string, required): the name of the plugin

## `builder`

An `object` representing the action builder.

Extensible: see [`builder`](../plugins/README.md#) contribution point.

### Properties

- `name`  (string, required): the name of the builder plugin.
- *paramname* (any): the plugin input parameters

### Example

```yaml
actions:
  zipaction:
    builder:
      name: package
      excludes:
        - *.ts
```

## `interpolation`

A `string` of the form `${ expr }` where `expr` is interpreted as a Javascript expression returning a JSON value. This expression is evaluated in a sandbox initialized to this object:

- `vars`: an `object` containing *resolved* variable values in addition to built-in variables.

The built-in variables are:
- `envname`: name of the current environment

## `environments`

An `object` representing a list of `environment`s.

### Properties

- *name* (object, [`environment`](#environment), optional): the *name*d environment. Use `envname` in interpolations to get the current environment name.

## `environment`

An `object` representing a set of policies attached to the environment.

### Properties

- `writable` (boolean, optional): dictate which deployment mode to use when deploying projects.

## Entity name resolution

Non-fully qualified entity names are resolved as follows:
  - partially qualified names (`packageName/actionName`) are resolved using the enclosing namespace
  - unqualified names (`actionName`) are resolved using the enclosing package name (if any) and namespace.

