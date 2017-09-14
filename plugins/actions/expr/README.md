
# Deployment configuration extension

Contribution point: [action](https://github.com/lionelvillard/openwhisk-deploy/blob/master/docs/format.md#action)

## Additional properties 

- expr: (string, optional): An nodejs expression.

## Example

```yaml
actions:
  error:
    kind: nodejs
    expr: {status: 'Um a very bad thing just happened - sorry?'}
```
 