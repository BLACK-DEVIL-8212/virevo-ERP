import { useCallback, useEffect, useState } from "react";
import "./Inventory.scss";
import usePageTitle from "../../hooks/usePageTitle";

import {
  getAllProducts,
  deleteProduct
} from "../../services/inventory.service";

import { useAuth } from "../../context/AuthContext";

import {
  ref,
  onValue,
  get,
  update,
  push
} from "firebase/database";

import { db } from "../../services/firebase";
import { getShopOptionLabel, normalizeShopRecord } from "../../services/shop.service";

const Inventory = () => {

  usePageTitle("Virevo Mall – Inventory");

  const { user } = useAuth();

  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState("");

  const [products, setProducts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const effectiveShopId =
    user?.role === "superadmin"
      ? selectedShopId
      : user?.shopId;

  const [form, setForm] = useState({
    name: "",
    category: "",
    mrp: "",
    costPrice: "",
    gst: "",
    stock: "",
    imei1: "",
    imei2: ""
  });

  const [editingId, setEditingId] = useState(null);

  /* ================= LOAD SHOPS ================= */

  useEffect(() => {

    if (user?.role !== "superadmin") return;

    const shopsRef = ref(db, "shops");

    const unsub = onValue(shopsRef, (snapshot) => {

      const list = [];

      snapshot.forEach((child) => {

        list.push(normalizeShopRecord(child.key, child.val()));

      });

      setShops(list.sort((a, b) => a.name.localeCompare(b.name)));

    });

    return () => unsub();

  }, [user]);

  /* ================= LOAD PRODUCTS ================= */

  const loadProducts = useCallback(async () => {

    if (!effectiveShopId) {
      setProducts([]);
      setLoading(false);
      return;
    }

    try {

      setLoading(true);
      setError("");

      const data = await getAllProducts(effectiveShopId);

      setProducts(Array.isArray(data) ? data : []);

    } catch (err) {

      console.error(err);
      setError("Failed to load products");

    } finally {

      setLoading(false);

    }

  }, [effectiveShopId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  /* ================= INPUT ================= */

  const handleChange = (e) => {

    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value
    }));

  };

  /* ================= RESET ================= */

  const resetForm = () => {

    setForm({
      name: "",
      category: "",
      mrp: "",
      costPrice: "",
      gst: "",
      stock: "",
      imei1: "",
      imei2: ""
    });

    setEditingId(null);
    setError("");

  };

  /* ================= VALIDATION ================= */

  const validateForm = () => {

    if (!form.name.trim()) return "Product name required";
    if (!form.category.trim()) return "Category required";
    if (!form.imei1.trim()) return "IMEI1 required";

    if (form.imei1 === form.imei2)
      return "IMEI1 and IMEI2 cannot be same";

    if (Number(form.stock) < 0)
      return "Invalid stock";

    if (Number(form.mrp) <= 0)
      return "Invalid MRP";

    return null;

  };

  /* ================= SUBMIT ================= */

  const handleSubmit = async (e) => {

    e.preventDefault();

    if (saving) return;

    const validation = validateForm();

    if (validation) {
      setError(validation);
      return;
    }

    if (!effectiveShopId) {
      setError("Select shop first");
      return;
    }

    try {

      setSaving(true);
      setError("");

      const imei1 = form.imei1.trim();
      const imei2 = form.imei2.trim() || null;

      /* ===== DUPLICATE CHECK ===== */

      const imei1Snap = await get(
        ref(db, `shops/${effectiveShopId}/imeiIndex/${imei1}`)
      );

      if (imei1Snap.exists() && imei1Snap.val() !== editingId) {
        setError("IMEI1 already exists");
        setSaving(false);
        return;
      }

      if (imei2) {

        const imei2Snap = await get(
          ref(db, `shops/${effectiveShopId}/imeiIndex/${imei2}`)
        );

        if (imei2Snap.exists() && imei2Snap.val() !== editingId) {
          setError("IMEI2 already exists");
          setSaving(false);
          return;
        }

      }

      const payload = {
        name: form.name.trim(),
        category: form.category.trim(),
        mrp: Number(form.mrp),
        costPrice: Number(form.costPrice),
        gst: Number(form.gst),
        stock: Number(form.stock),
        imei1,
        imei2
      };

      let productId = editingId;

      if (!editingId) {

        const newRef = push(
          ref(db, `shops/${effectiveShopId}/products`)
        );

        productId = newRef.key;

      }

      /* ===== ATOMIC MULTI UPDATE ===== */

      const updates = {};

      updates[
        `shops/${effectiveShopId}/products/${productId}`
      ] = payload;

      updates[
        `shops/${effectiveShopId}/imeiIndex/${imei1}`
      ] = productId;

      if (imei2) {

        updates[
          `shops/${effectiveShopId}/imeiIndex/${imei2}`
        ] = productId;

      }

      await update(ref(db), updates);

      resetForm();
      await loadProducts();

    } catch (err) {

      console.error(err);
      setError("Failed to save product");

    } finally {

      setSaving(false);

    }

  };

  /* ================= EDIT ================= */

  const handleEdit = (p) => {

    setEditingId(p.id);

    setForm({
      name: p.name || "",
      category: p.category || "",
      mrp: p.mrp || "",
      costPrice: p.costPrice || "",
      gst: p.gst || "",
      stock: p.stock || "",
      imei1: p.imei1 || "",
      imei2: p.imei2 || ""
    });

  };

  /* ================= DELETE ================= */

  const handleDelete = async (id) => {

    if (!window.confirm("Delete this product?"))
      return;

    try {

      await deleteProduct(effectiveShopId, id);

      await loadProducts();

    } catch (err) {

      console.error(err);
      setError("Delete failed");

    }

  };

  /* ================= UI ================= */

  return (

    <div className="inventory-page">

      <h1>Inventory Management</h1>

      {user?.role === "superadmin" && (

        <div className="shop-select-wrapper">

          <select
            value={selectedShopId}
            onChange={(e) =>
              setSelectedShopId(e.target.value)
            }
          >

            <option value="">Select Shop</option>

            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {getShopOptionLabel(shop)}
              </option>
            ))}

          </select>

        </div>

      )}

      {error && (
        <div className="error">{error}</div>
      )}

      {/* FORM */}

      <form
        className="inventory-form"
        onSubmit={handleSubmit}
      >

        <input name="name" placeholder="Product Name" value={form.name} onChange={handleChange} required />

        <input name="category" placeholder="Category" value={form.category} onChange={handleChange} required />

        <input name="mrp" type="number" placeholder="MRP" value={form.mrp} onChange={handleChange} required />

        <input name="costPrice" type="number" placeholder="Cost Price" value={form.costPrice} onChange={handleChange} required />

        <input name="gst" type="number" placeholder="GST %" value={form.gst} onChange={handleChange} required />

        <input name="stock" type="number" placeholder="Stock Qty" value={form.stock} onChange={handleChange} required />

        <input name="imei1" placeholder="IMEI 1" value={form.imei1} onChange={handleChange} required />

        <input name="imei2" placeholder="IMEI 2 (Optional)" value={form.imei2} onChange={handleChange} />

        <button type="submit" disabled={saving}>

          {saving
            ? "Saving..."
            : editingId
            ? "Update Product"
            : "Add Product"}

        </button>

        {editingId && (

          <button
            type="button"
            className="cancel"
            onClick={resetForm}
          >
            Cancel
          </button>

        )}

      </form>

      {/* TABLE */}

      {loading ? (

        <p>Loading...</p>

      ) : (

        <table className="inventory-table">

          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>MRP</th>
              <th>Stock</th>
              <th>GST</th>
              <th>IMEI 1</th>
              <th>IMEI 2</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>

            {products.map((p) => (

              <tr key={p.id} className={p.stock <= 5 ? "low-stock" : ""}>

                <td>{p.name}</td>
                <td>{p.category}</td>
                <td>₹ {p.mrp}</td>
                <td>{p.stock}</td>
                <td>{p.gst}%</td>
                <td>{p.imei1}</td>
                <td>{p.imei2 || "-"}</td>

                <td>

                  <button onClick={() => handleEdit(p)}>
                    Edit
                  </button>

                  <button className="danger" onClick={() => handleDelete(p.id)}>
                    Delete
                  </button>

                </td>

              </tr>

            ))}

            {products.length === 0 && (

              <tr>
                <td colSpan="8" style={{ textAlign: "center" }}>
                  No products found
                </td>
              </tr>

            )}

          </tbody>

        </table>

      )}

    </div>

  );

};

export default Inventory;
