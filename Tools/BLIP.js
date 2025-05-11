const FileSystem = require('fs');

const ImageToText = (Name, Message, ChatId, IsNotLink, InputImage => {
  if (IsNotLink) {
    const ImageBytes = await FileSystem.readFileSync(`${InputImage}`);
    ImageMethod = { data: { image: { base64: ImageBytes } } }
  } else { ImageMethod = { data: { image: { url: InputImage } } } }
  Request.get(InputImage, function (Error, Response, Body) {
    if (!Error && Response.statusCode == 200) {
      Data = "data:" + Response.headers["content-type"] + ";base64," +
             Buffer.from(Body).toString('base64');
      fetch("https://nielsr-comparing-captioning-models.hf.space/run/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [ Data, ] })
      })
      .then(Respond => Respond.json())
      .then(Respond => {
        if (Respond.data) {
          console.log(Respond.data[3]);
          GetTextImage(Name, Respond.data[3], Message);
          ObtainMonikaResponse(ChatId);
        } else {
          Stub.PostModelOutputs(
            {
              user_app_id: {
              user_id: "clarifai",
              app_id: "main"
            },
            model_id: "general-english-image-caption-clip",
            inputs: [ ImageMethod ]
          },
          Metadata,
          (Error, Response) => {
            console.log("Uploading url to clarify:\t" + 
                        Response.status.description);
            if (Error) {
              return console.error(Error);
            }
            if (Response.status.code !== 10000) {
              return console.error("Post model outputs failed, status: " +
                                   Response.status.description);
            }
            (async () => {
              console.log(Response.outputs[0].data.text.raw);
              GetTextImage(Name, Response.outputs[0].data.text.raw, Message);
              ObtainMonikaResponse(ChatId);
            })();
          });
        }
      })
    }
  });
});

module.exports = {
  imageToText: ImageToText(Name, Message, ChatId, IsNotLink, InputImage),
}