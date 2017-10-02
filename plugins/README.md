*Warning: work in progress.*

This directory contains plugins extending the project configuration format .

# Plugin registration

In your `package.json` file, add the following entry:

```json
{
    "wskp": {
        "<extension-point>": "<plugin-name>",
        ...
    }
}
```

Where `extension-point` is one of the following values:
- `action`: contributes to an [`action`](../docs/format.md#action) 
- `api`: contributes to an [`api`](../docs/format.md#api) 
- `builder`: contributes to an action [`builder`](../docs/format.md#builder) 

A plugin can contribute to multiple extension point. See [types](https://github.com/lionelvillard/openwhisk-project/blob/master/libs/types.ts) for the signature definition for each extension point 

# Extension points

# `action`

The plugin `plugin-name` is activated during this initialization phase when `plugin-name` occurs 
within the configuration of an [`action`](../docs/format.md#action), for instance:

```yaml
...
actions:
  <action-name>:
    <plugin-name>: ...   
```

Multiple plugins can be activated for the same action, until the action has no properties other than the one defined by the [action](../docs/format.md#action) type. 

# `builder`

The plugin `plugin-name` is activated during the deployment phase when name of a [`builder`](../docs/format.md#builder) matches `plugin-name`.

```yaml
...
actions:
  <action-name>:
    builder:
      name: <plugin-name>   
```

# Plugin submission

This is done via PR:
- Clone https://github.com/lionelvillard/openwhisk-project
- edit `plugins/package.json` to include your extension
- submit PR.
