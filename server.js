const express = require("express")
const server = express()

server.all("/", (req, res) => {
  res.send("Online!")
})

function keepAlive() {
  server.listen(3000, () => {
    console.log("It's ready")
  })
}

module.exports = keepAlive