This project provides a set of tools for deploying OpenWhisk entities 
specified in the format described below.
 
# Getting started

## Node.js library

```bash
$ npm install @openwhisk-deploy/deployer --save
```

## CLI

```bash
$ npm install @openwhisk-deploy/cli -g
$ wskd 
```
## OpenWhisk action

(Work in progress.)

In your manifest, add:
```yaml
includes:
  - location: github.com/lionelvillard/openwhisk-deploy
```

# Deployment Specification

The deployment specification uses the YAML syntax and JSON schema to describe constraints
on the syntax. These constraints are presented below.

## `Deployment` (top-level schema)

A *deployment* is an *object* representing a collection of OpenWhisk entities to be deployed.

### Properties

- [`includes`](#includes) (array, optional)
- [`packages`](#packages) (object, optional)
- [`triggers`](#triggers) (object, optional)
- [`rules`](#rules) (object, optional)

### Example

```yaml
includes:
packages:
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

- `{package-name}` (`binding` | `packageContent`, optional)

## `binding`

An *object* representing a package binding

### Properties

- `bind` (string, required): the name of the package to bind
- `inputs` (`parameters`, optional): binding parameters
- `annotations` (`annotations`, optional)
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

- `actions` (object, optional): a list of actions
- `sequences` (object, optional): a list of sequence actions
- `inputs` (`parameters`, optional): package parameters
- `annotations` (`annotations`, optional)
- `publish` (boolean, optional, default: false): indicate whether the package is public or private

## `actions`

An *object* representing a list of `action`s.

## Properties

- `{action-name}` (`action`, optional)

  `action-name` must be [unqualified](https://github.com/apache/incubator-openwhisk/blob/master/docs/reference.md#fully-qualified-names)
  and must be unique among the list of action names and sequence action names. 

## `action`

An *object* representing an action.

### Properties

- `name` (string, required): the action ([unqualified](https://github.com/apache/incubator-openwhisk/blob/master/docs/reference.md#fully-qualified-names)) name.
  Must be unique among the list of action names and sequence action names. 
- `location` (string, required): the action code location
   
   Must be a path relative to the directory containing the deployment file.
- `kind` (`enum`, optional): the action kind. If not provided, it is determined based on the location file extension
   - `nodejs`: node js action. Selected when file extension is `.js` 
   - `nodejs:6`
- `zip` (boolean, optional, default: false): whether to zip the action. 
   
   - For `nodejs` action, `npm install --production` is run before `zip` 
- `limits` (`limits`, optional): the action limits
- `inputs` (`parameters`, optional): action parameters
- `annotations` (`annotations`, optional)

## Example

```yaml
packages:
  utils:
    actions:
      cat:
        location: cat.js
        kind: nodejs
```

## `sequences`

An *object* representing a list of `sequence` actions.

## Properties

- `{sequence-action-name}` (`sequence`, optional)

  `sequence-action-name` must be [unqualified](https://github.com/apache/incubator-openwhisk/blob/master/docs/reference.md#fully-qualified-names)
  and must be unique among the list of action names and sequence action names. 

## `sequence`

An *object* representing a sequence action.

### Properties

- `actions` (string, required): a comma-separated list of action names. White space characters are ignored.
     
   Non-fully qualified action names are resolved as described [here](#entity-name-resolution)  
     
- `limits` (`limits`, optional): the action limits
- `inputs` (`parameters`, optional): action parameters
- `annotations` (`annotations`, optional)

### Example

```yaml
packages:
  utils:
    sequences:
      mysequence:
        actions: /whisk.system/utils/echo, /whisk.system/utils/cat
```

## `triggers`

An `object` representing a list of `trigger`s.

### Properties

- `{trigger-name}` (`trigger`|`feed`, optional)

## `trigger`

An *object* representing a trigger.

## Properties

- `inputs` (`parameters`, optional): trigger parameters
- `annotations` (`annotations`, optional)
- `publish` (boolean, optional, default: false): indicate whether the package is public or private

## `feed`

An *object* representing a feed.

## Properties

- `feed` (string, required): a feed name
- `inputs` (`parameters`, optional): feed parameters
- `annotations` (`annotations`, optional)
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

- `{rule-name}` (`rule`, optional)

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

## Entity name resolution

Non-fully qualified entity names are resolved as follows:
  - partially qualified names (ie. `pkgName/name`) are resolved using the enclosing namespace
  - unqualified names (ie. `name`) are resolved using the enclosing package name (if any) and namespace. 
