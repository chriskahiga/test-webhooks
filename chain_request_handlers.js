
module.exports = {
    checkRegistration: (agent, client) => {
        let requestContext = agent.context.get('current_request');
        let requestId = requestContext.parameters.requestId;
        console.log(requestContext);
        return new Promise((resolve, reject) => {
            client.get(`request: ${requestId}`, (err, result) => {
                if (result) {
                    const resultJSON = JSON.parse(result);
                    console.log('\nRESULT RETRIEVED FROM REDIS')
                    console.log('....REQUEST CHAIN HAS ENDED')
                    resolve(resultJSON)
                } else {
                    resolve(false)
                }
            })
        })
    }
}