# Deployment Format Specification

The deployment specification uses the YAML syntax and JSON schema to describe constraints
on the syntax. These constraints are presented below.

## `Deployment` (top-level schema)

A *deployment* is an *object* representing a collection of OpenWhisk entities to be deployed.

### Properties

- [`includes`](#includes) (array, optional)
- [`packages`](#packages) (object, optional)
- [`actions`](#actions) (object, optional)
- [`triggers`](#triggers) (object, optional)
- [`rules`](#rules) (object, optional)

### Example

```yaml
includes:  # includes other deployment
actions:   # actions in the default package
packages:  # actions in packages and package bindings
triggers:  
rules:
```

## `includes` 

An *array* of `include` *objects* representing the inclusion of an external manifest file 
into this manifest, as is. 

All entities specified in the external file are merged with the 
entities contained in the main manifest, potentially breaking some rules, such as unique package name

## `include`
 
A *object* representing a manifest to include.

### Properties

- `location` (string, required): 
    
   Path to the root directory containing the `manifest.yaml` file. 
   
   Supported format: 
     - `github.com/{owner}/{repo}/{path}` 
 
### Example

```yaml
includes:
  - location: github.com/lionelvillard/openwhisk-deploy
```

## `packages`

An *object* representing a list of packages. Package name must be unique among the set of package names within a namespace 
 
### Properties

- `{package-name}` ([`binding`](#binding) | [`packageContent`](#packageContent), optional)

## `binding`

An *object* representing a package binding

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

An *object* representing the content of a package.

### Properties

- [`actions`](#actions) (object, optional): a list of actions
- [`sequences`](#sequences) (object, optional): a list of sequence actions
- `inputs` ([`parameters`](#parameters), optional): package parameters
- `annotations` ([`annotations`](#annotations), optional)
- `publish` (boolean, optional, default: false): indicate whether the package is public or private

## `actions`

An *object* representing a list of `action`s. 

Actions can be specified in any order, e.g. actions composing sequences can be specified after sequences.
An error is raised when there is a dependency cycle.  

### Properties

- `{action-name}` ([`action`](#action) | [`sequence`](#sequence) | [`copy`](#copy) | [`inline`](#inline) | [`docker`](#inline), optional)

  `action-name` must be [unqualified](https://github.com/apache/incubator-openwhisk/blob/master/docs/reference.md#fully-qualified-names)
  and must be unique among the list of action names.

## `action`

An *object* representing an action. Extends [`baseAction`](#baseaction)

### Properties

- `location` (string, required): the action code location. Either a folder or a file.
   
   Must be a path relative to the directory containing the deployment file.

- `kind` (enum, optional): the action kind. Determined automatically (see below)  
   - `nodejs`: node js (latest builtin version) action. This is the default kind when 
       - the location points to a file with the extension `.js`
       - the location points to `package.json` 
       - the location points to a folder containing `package.json` 
   - `nodejs:6`: builtin node js 6.* action. See the [nodejs6 docker file](https://raw.githubusercontent.com/apache/incubator-openwhisk/master/core/nodejs6Action/Dockerfile) for the details of which npm packages are available. 
   
- `zip` (boolean, optional, default: false): whether to zip the action. 
   
   - For `nodejs` action, `npm install --production` is run before `zip` 

### Example

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

## `copy`  

An *object* representing an action to copy. 

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

An *object* representing an action with inlined code. 

Extends [`baseAction`](#baseaction)

### Properties

- `code` (string, required): the action main function content.   
- `extra` (string, optional): additional code   
- `kind` ([`baseAction`](#baseaction) enum, required): the required action kind
   
### Example

```yaml
packages:
  utils:
    actions:
      myecho:   
        code: 
          console.log(params)
          return params || {}
```
## `sequence`

An *object* representing a sequence action. Extends [`baseAction`](#baseaction)

### Properties

- `sequence` (string, required): a comma-separated list of action names. White space characters are ignored.
     
   Non-fully qualified action names are resolved as described [here](#entity-name-resolution)  
     
 
### Example

```yaml
packages:
  utils:
    actions:
      mysequence:
        sequence: /whisk.system/utils/echo, /whisk.system/utils/cat
```

## `docker`

A docker action. See [docker action](https://github.com/apache/incubator-openwhisk/blob/master/docs/actions.md#creating-docker-actions) for more details

### Properties

- `docker` (string, required): a docker image.

### Example

```yaml
actions:
  docker-action:
    image: openwhisk/dockerskeleton
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


## `triggers`

An `object` representing a list of `trigger`s.

### Properties

- `{trigger-name}` ([`trigger`](#trigger)|[`feed`](#feed), optional)

## `trigger`

An *object* representing a trigger.

## Properties

- `inputs` ([`parameters`](#parameters), optional): trigger parameters
- `annotations` ([`annotations`](#annotations), optional)
- `publish` (boolean, optional, default: false): indicate whether the package is public or private

## `feed`

An *object* representing a feed.

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
      dbname: $CLOUDANT_DATABASE
```

## `rules`

An `object` representing a list of `rules`s.

### Properties

- `{rule-name}` ([`rule`](#rule), optional): 

## `rule`

An `object` representing a rule.

### Properties

- trigger (string, required): the trigger name. Resolved as described [here](#entity-name-resolution)
- action (string, required): the action name. Resolved as described [here](#entity-name-resolution)  
     
### Example

```yaml
rules:
  # Rule named "echo-images"
  # Creating rule that maps database change trigger to sequence
  echo-images:
    trigger: image-uploaded
    action: write-from-cloudant-sequence
```


## `parameters`

An *object* representing a list of parameters

### Properties

- `{key}` (string, optional)

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

An *object* representing a list of annotations

### Properties

- `{key}` (string, optional)


## `limits`

An *object* representing action limits

### Properties

- `memory` (integer, optional, default: 256): the maximum memory limit in MB for the action
- `logsize` (integer, optional, default:10): the maximum log size limit in MB for the action
- `timeout` (integer, optional, default:60000): the timeout limit in milliseconds after which the action is terminated 

## Entity name resolution

Non-fully qualified entity names are resolved as follows:
  - partially qualified names (ie. `pkgName/name`) are resolved using the enclosing namespace
  - unqualified names (ie. `name`) are resolved using the enclosing package name (if any) and namespace. 

