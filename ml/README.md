# Training the waste-photo classifier (Google Colab, free GPU)

The citizen app sends the waste photo to the server, and the server suggests the waste type. If the citizen
picks a different type than a confident AI (≥ 70%), the request is flagged as possible mis-segregation
in the dashboard and in the driver's app. This folder trains that model.

**Model:** MobileNetV3-Large pre-trained on ImageNet, fine-tuned (transfer learning), exported to ONNX
(~17 MB). The server runs it on CPU with ONNX Runtime. No GPU is needed after training.

**Data:** Kaggle *Garbage Classification* (`mostafaabla/garbage-classification`). It has 12 item classes
(battery, biological, cardboard, clothes, metal, paper, plastic, shoes, trash, brown/green/white glass)
and about 15,000 photos. An e-waste dataset is optional (see step 4). Item classes map to SmartRoute
types like this:

| SmartRoute type | Item classes |
|---|---|
| organic | biological |
| recyclable | paper, cardboard, plastic, metal, all glass |
| hazardous | battery |
| e_waste | anything from the optional e-waste dataset |
| general | trash, clothes, shoes |

## Steps (about 30 minutes, mostly waiting)

1. **Kaggle token:** sign in at kaggle.com → profile picture → **Settings** → **API** →
   **Generate New Token**, then **copy** the token shown (it's shown only once; keep it private).
   *(If you still have an old `kaggle.json` file, that works too.)*
2. **Open Colab:** go to https://colab.research.google.com → **Upload** → choose
   `ml/train_waste_classifier.ipynb` from this project.
3. **GPU:** **Runtime → Change runtime type → T4 GPU → Save**.
4. *(Optional, adds the e-waste class)* On Kaggle, search "e-waste image dataset" and open one with
   photos in class folders. Copy its slug (the `owner/name` part of the URL) into `EWASTE_DATASET` in cell 3.
5. **Runtime → Run all.** Cell 2 shows a text box: press **Enter**, then **paste the token** and press Enter
   (or type `j` to upload an old `kaggle.json`). It should print **Kaggle login OK**.
6. Training prints accuracy after every epoch (about 2 min each on a T4). Cell 8 shows the
   **test accuracy and the confusion matrix**. Screenshot it for the report.
7. At the end, `smartroute_model.zip` downloads. Unzip it into **`backend/app/ai/model/`**:
   ```
   backend/app/ai/model/waste_classifier.onnx
   backend/app/ai/model/labels.json
   backend/app/ai/model/confusion_matrix.png
   ```
8. Commit and push. Render redeploys; Dashboard → **Evaluation** → *AI waste-photo classifier* now shows
   the model's accuracy.

## Check locally

```bat
cd backend
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
Open http://localhost:8000/ai/status. It should say `"available": true` with the accuracy.
