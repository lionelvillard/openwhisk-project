This is an OpenWhisk Deploy plugin adding swagger support

# Usage

This plugin is triggered when the api definition contains the `swagger` property. For instance:

```yaml
apis:
  myapi:
    swagger: path/to/swagger.json
```

This plugin also support Swagger specification written in YAML. It supports both extensions `.yaml` and `.yml`.

The mapping between a swagger path to an OpenWhisk action is done by adding the vendor specific property named `x-openwhisk-action` in [`operationObject`](https://github.com/OAI/OpenAPI-Specification/blob/v3.0.1/versions/3.0.1.md#operationObject). For instance:

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
