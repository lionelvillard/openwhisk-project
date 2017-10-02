This plugin builds action packages, i.e. zip files that can then be deployed.

# Deployment configuration extension

Contributes to: 
- [builder](https://github.com/lionelvillard/openwhisk-project/blob/master/docs/format.md#builder)
- [action](https://github.com/lionelvillard/openwhisk-project/blob/master/docs/format.md#action)

## `builder` contribution 

- package: (packageOptions, required): the package configuration.

### Example

```yaml
actions:
  zip-action:
    builder:
      name: package
      excludes:
        - *.ts
```

### `packageOptions`

#### Properties  

- `includes` (string | string[], optional): the set of [glob](https://github.com/isaacs/node-glob) to include. Default is `**`.
- `excludes` (string | string[], optional): the set of [glob](https://github.com/isaacs/node-glob) to exclude.
- `follow` (boolean, optional): follow symlinks. Default is `false`

## `action` contribution 

This contribution adds the property `package` to `action` providing a convenient way to configure the package builder in the action itself. 

### Example

```yaml
actions:
  zip-action:
    package: 
      excludes:
        - *.ts
```

which expands to 

```yaml
actions:
  zip-action:
    builder:
      name: package
      excludes:
        - *.ts
```