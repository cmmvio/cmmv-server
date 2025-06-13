'use strict';

const { default: cmmv } = require('@cmmv/server');

const app = cmmv();
app.get("/", async (req, res) => res.send("Hello World"));
app.listen({ host: "0.0.0.0", port: 5001 })
.then(server => {
    console.log(
        `Listen on http://${server.address().address}:${server.address().port}`,
    );
})
.catch(err => {
    throw Error(err.message);
});