const webhook = require('./webhook')

webhook.listen(process.env.PORT || 8080, console.log(`Webhook listening on port 8080`))