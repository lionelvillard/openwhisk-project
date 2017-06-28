Warning: work in progress. Comments are welcomed.

This directory contains plugins extending the deployment format.

# Adding a new action

Action plugins must be stored in the `actions` subdirectory 
and must follow this minimal structure:

```
actions
|- <extension-name>
   |- package.json
```

The extension can then be used inside the `actions` section:

```yaml
...
actions:
  <action-name>:
    <extension-name>: ...   
```

# Plugin interface

```javascript
const Plugin = {
    // Whether this plugin accepts the given context
    acceptContext: context => {}
    
    // Get the list of entities to deploy
    getEntities: context => {}
}
```

## `context` properties
 
- `pkgName` (string, optional): the current package name, or `undefined`
- `actionName` (string, optional): the current action name
- `action` (object, optional): the action content


# Submitting plugins

Via PR. 

It is recommended to only include `package.json` in the PR
and to publish your plugin in the npm registry. You can then 
release plugin updates without having to way for us to approve
your PR.
