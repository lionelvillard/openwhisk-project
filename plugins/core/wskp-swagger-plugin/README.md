This plugin extends OpenWhisk Deploy with swagger support.

# Deployment configuration extension

Contribution point: [api](https://github.com/lionelvillard/openwhisk-deploy/blob/master/docs/format.md#api)

## Additional properties to [api](https://github.com/lionelvillard/openwhisk-deploy/blob/master/docs/format.md#api)

- swagger: (string, optional): a path to a swagger file. Support `.json`, `.yml` and `.yaml` file extensions

## Example

```yaml
apis:
  myapi:
    swagger: path/to/swagger.json

  myyamlapi:
    swagger: path/to/swagger.yml
```

# Swagger file vendor extension

## `x-openwhisk-action`

Specify the action to associate with an [`operation`](https://github.com/OAI/OpenAPI-Specification/blob/v3.0.1/versions/3.0.1.md#operationObject)

### Example 

```json
"paths": {
  "/v1/skills": {
    "get": {
      "summary": "List the skills",
      "description": "Returns a list of the currently known skills",
      "x-openwhisk-action": "skills/list"
    }
  }
}
```
