function main({name:name='Serverless API'}) {
    return {
      body: new Buffer(JSON.stringify({payload:`Hello world ${name} 2`})).toString('base64'),
      statusCode: 200,
      headers:{ 'Content-Type': 'application/json'}
    };
}
