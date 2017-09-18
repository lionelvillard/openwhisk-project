This OpenWhisk Deploy plugin adds syntactic sugar constructs for configuring web actions.  

**Experimental**

# Deployment configuration extension

Contribution point: [action](https://github.com/lionelvillard/openwhisk-deploy/blob/master/docs/format.md#action)

## Additional properties 

- web: (string | [`webbody`](#webbody), optional): The web resource to deploy.

The simple form takes a string value representing the location of the web resource to deploy. It expands to this full form:

```yaml
web:
  headers:
      headers:
        Content-Type: < content type associated to the location extension > 
      statusCode: 200
      body: < the resource content (base64 or not)>
```

## Example - Simple Form

```yaml
actions:
  icon:
    web: ./icon.svg
```
 

## Example - Expanded Form

```yaml
actions:
  icon:
    web:
      headers:
        Set-Cookie: 'UserID=Jane; Max-Age=3600; Version='
        Content-Type: 'text/html' 
      statusCode: 200
      body: '<html><body><h3>hello</h3></body></html>'

```

Which in turn expands to:

```yaml
actions:
  icon:
    kind: nodejs
    code: | 
      function main() {
        return { headers: { 'Set-Cookie': 'UserID=Jane; Max-Age=3600; Version=', 'Content-Type': 'text/html' },
                 statusCode: 200,
                 body: '<html><body><h3>hello</h3></body></html>'
               } 
      }
    annotations:
      web-export: true
```