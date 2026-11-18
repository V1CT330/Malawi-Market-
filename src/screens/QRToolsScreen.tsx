import React, { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";

export type QRProduct = {
  id: string;
  title: string;
  price_mwk: number;
  demo?: boolean;
};

type Props = {
  products: QRProduct[];
  initialProduct: QRProduct | null;
  onProductChange: (product: QRProduct | null) => void;
  onScan: (value: string) => void;
  onBack: () => void;
};

const productQrValue = (id: string) =>
  `mw.wealthgrid.malawimarket://product/${encodeURIComponent(id)}`;

export function QRToolsScreen({ products, initialProduct, onProductChange, onScan, onBack }: Props) {
  const [mode, setMode] = useState<"create" | "scan">(initialProduct ? "create" : "scan");
  const [selectedProduct, setSelectedProduct] = useState<QRProduct | null>(initialProduct);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);

  useEffect(() => {
    setSelectedProduct(initialProduct);
    if (initialProduct) setMode("create");
  }, [initialProduct]);

  const chooseProduct = (product: QRProduct) => {
    setSelectedProduct(product);
    onProductChange(product);
  };

  const handleBarcode = ({ data }: { data: string }) => {
    if (scanLock.current) return;
    scanLock.current = true;
    onScan(data);
  };

  const startScanning = () => {
    scanLock.current = false;
    setMode("scan");
  };

  const shareCode = async () => {
    if (!selectedProduct) return;
    try {
      await Share.share({
        title: `Malawi Market: ${selectedProduct.title}`,
        message: `View ${selectedProduct.title} on Malawi Market: ${productQrValue(selectedProduct.id)}`,
      });
    } catch {
      Alert.alert("Share unavailable", "The product link could not be shared from this device.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹  Back to marketplace</Text></Pressable>
      <Text style={styles.title}>QR codes</Text>
      <Text style={styles.subtitle}>Create a scannable product code or scan a Malawi Market product code.</Text>

      <View style={styles.tabs}>
        <Pressable onPress={() => setMode("create")} style={[styles.tab, mode === "create" && styles.activeTab]}>
          <Text style={[styles.tabText, mode === "create" && styles.activeTabText]}>Create QR</Text>
        </Pressable>
        <Pressable onPress={startScanning} style={[styles.tab, mode === "scan" && styles.activeTab]}>
          <Text style={[styles.tabText, mode === "scan" && styles.activeTabText]}>Scan QR</Text>
        </Pressable>
      </View>

      {mode === "create" ? (
        <>
          <Text style={styles.sectionTitle}>Choose a product</Text>
          {products.length === 0 ? (
            <Text style={styles.empty}>No published products are available to generate QR codes for.</Text>
          ) : (
            <View style={styles.productList}>
              {products.map(product => (
                <Pressable key={product.id} onPress={() => chooseProduct(product)} style={[styles.productRow, selectedProduct?.id === product.id && styles.selectedRow]}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={styles.productName}>{product.title}</Text>
                    <Text style={styles.productPrice}>MK {Number(product.price_mwk || 0).toLocaleString("en-US")}</Text>
                  </View>
                  <Text style={styles.chooseLabel}>{selectedProduct?.id === product.id ? "Selected" : "Choose"}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {selectedProduct ? (
            <View style={styles.qrCard}>
              <Text style={styles.qrTitle}>{selectedProduct.title}</Text>
              <View style={styles.qrCanvas}>
                <QRCode value={productQrValue(selectedProduct.id)} size={220} backgroundColor="#ffffff" color="#111827" />
              </View>
              <Text style={styles.qrHint}>Scan this code in Malawi Market to open this product.</Text>
              <Text selectable style={styles.codeText}>{productQrValue(selectedProduct.id)}</Text>
              <Pressable onPress={() => void shareCode()} style={styles.primaryButton}><Text style={styles.primaryText}>Share product QR link</Text></Pressable>
            </View>
          ) : (
            <Text style={styles.empty}>Select a product to generate its QR code.</Text>
          )}
        </>
      ) : (
        <View style={styles.scannerCard}>
          <Text style={styles.sectionTitle}>Scan a product QR code</Text>
          {!permission ? (
            <Text style={styles.empty}>Checking camera permission…</Text>
          ) : !permission.granted ? (
            <>
              <Text style={styles.permissionText}>Camera access is required to scan QR codes. Malawi Market only uses the camera while this scanner is open.</Text>
              <Pressable onPress={() => void requestPermission()} style={styles.primaryButton}><Text style={styles.primaryText}>Allow camera access</Text></Pressable>
              {permission.canAskAgain === false ? <Text style={styles.permissionText}>Camera access is blocked in Android settings. Enable it for Malawi Market, then return here.</Text> : null}
            </>
          ) : (
            <>
              <View style={styles.cameraFrame}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={scanLock.current ? undefined : handleBarcode}
                />
                <View pointerEvents="none" style={styles.scanOverlay}>
                  <View style={styles.scanCorner} />
                </View>
              </View>
              <Text style={styles.qrHint}>Point your camera at a Malawi Market product QR code.</Text>
              <Pressable onPress={startScanning} style={styles.secondaryButton}><Text style={styles.secondaryText}>Scan another code</Text></Pressable>
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 130, backgroundColor: "#fff" },
  back: { paddingVertical: 10 },
  backText: { color: "#e87520", fontWeight: "800", fontSize: 14 },
  title: { color: "#202124", fontSize: 27, fontWeight: "900", marginTop: 8 },
  subtitle: { color: "#606875", fontSize: 13, lineHeight: 20, marginTop: 6, marginBottom: 18 },
  tabs: { flexDirection: "row", backgroundColor: "#f1f2f4", borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 9 },
  activeTab: { backgroundColor: "#ef7628" },
  tabText: { color: "#424a55", fontSize: 13, fontWeight: "800" },
  activeTabText: { color: "#fff" },
  sectionTitle: { color: "#252a31", fontSize: 17, fontWeight: "900", marginBottom: 12 },
  productList: { gap: 8 },
  productRow: { borderWidth: 1, borderColor: "#e0e3e8", borderRadius: 12, padding: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  selectedRow: { borderColor: "#ef7628", backgroundColor: "#fff8f2" },
  productName: { color: "#252a31", fontSize: 13, fontWeight: "800" },
  productPrice: { color: "#5f6875", fontSize: 12, marginTop: 5 },
  chooseLabel: { color: "#e87520", fontWeight: "900", fontSize: 12 },
  qrCard: { alignItems: "center", marginTop: 20, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: "#e0e3e8", backgroundColor: "#fff" },
  qrTitle: { color: "#252a31", fontWeight: "900", fontSize: 17, textAlign: "center", marginBottom: 16 },
  qrCanvas: { padding: 14, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#eceff2" },
  qrHint: { color: "#606875", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 14 },
  codeText: { color: "#747d89", fontSize: 10, textAlign: "center", marginTop: 9 },
  primaryButton: { backgroundColor: "#ef7628", paddingHorizontal: 18, paddingVertical: 14, borderRadius: 11, alignItems: "center", width: "100%", marginTop: 16 },
  primaryText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  empty: { color: "#68717e", fontSize: 13, lineHeight: 20, paddingVertical: 18 },
  scannerCard: { padding: 15, borderWidth: 1, borderColor: "#e0e3e8", borderRadius: 16 },
  permissionText: { color: "#5d6672", fontSize: 13, lineHeight: 20 },
  cameraFrame: { height: 340, borderRadius: 15, overflow: "hidden", backgroundColor: "#111827" },
  scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  scanCorner: { width: 230, height: 230, borderWidth: 3, borderColor: "#ef7628", borderRadius: 20 },
  secondaryButton: { borderWidth: 1, borderColor: "#ef7628", padding: 13, borderRadius: 10, alignItems: "center", marginTop: 14 },
  secondaryText: { color: "#e87520", fontWeight: "900", fontSize: 13 },
});
