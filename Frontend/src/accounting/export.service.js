import { ref, get } from "firebase/database";
import { db } from "../services/firebase";

export const exportAccountingData = async (shopId) => {

  const refPath = ref(
    db,
    `shops/${shopId}/accounting`
  );

  const snap = await get(refPath);

  if (!snap.exists()) return null;

  return JSON.stringify(snap.val());

};