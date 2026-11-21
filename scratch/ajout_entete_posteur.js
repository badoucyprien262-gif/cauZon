const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, '../cauZon__utulisateur/frontend/src/screens/EcranEspacePosteur.tsx');
let s = fs.readFileSync(p, 'utf8');

const must = (a) => { if (!s.includes(a)) throw new Error('absent: ' + a.slice(0, 60)); };

// 1. import useNavigation
must("import { Ionicons } from '../components/AppIcon';");
s = s.replace(
  "import { Ionicons } from '../components/AppIcon';",
  "import { useNavigation } from '@react-navigation/native';\nimport { Ionicons } from '../components/AppIcon';"
);

// 2. hook navigation + retour
must("  const styles = getStyles(couleurs);\n\n  const [espace, setEspace]");
s = s.replace(
  "  const styles = getStyles(couleurs);\n\n  const [espace, setEspace]",
  "  const styles = getStyles(couleurs);\n  const navigation = useNavigation<any>();\n  const retour = useCallback(() => {\n    if (navigation.canGoBack()) navigation.goBack();\n    else navigation.navigate('MainTabs');\n  }, [navigation]);\n\n  const [espace, setEspace]"
);

// 3. entête sous-page dans chacune des 4 branches
const marqueur = '<SafeAreaView style={styles.container}>';
const n = s.split(marqueur).length - 1;
if (n !== 4) throw new Error('attendu 4 SafeAreaView, trouvé ' + n);
s = s.split(marqueur).join(marqueur + '\n          <EnteteSousPage styles={styles} couleurs={couleurs} onRetour={retour} />');

// 4. composant entête + styles
must('function ReglesPublication(');
s = s.replace(
  'function ReglesPublication(',
  `function EnteteSousPage({ styles, couleurs, onRetour }: { styles: any; couleurs: any; onRetour: () => void }) {
  return (
    <View style={styles.enteteSousPage}>
      <TouchableOpacity onPress={onRetour} style={styles.boutonRetour} activeOpacity={0.8} accessibilityLabel="Retour">
        <Ionicons name="arrow-back" size={22} color={couleurs.texte} />
      </TouchableOpacity>
      <Text style={styles.enteteSousPageTitre}>Espace Posteur</Text>
      <View style={styles.boutonRetour} />
    </View>
  );
}

function ReglesPublication(`
);

must('    container: { flex: 1, backgroundColor: c.fond },');
s = s.replace(
  '    container: { flex: 1, backgroundColor: c.fond },',
  `    container: { flex: 1, backgroundColor: c.fond },
    enteteSousPage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: Platform.OS === 'android' ? 36 : 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.bordure, backgroundColor: c.fond },
    boutonRetour: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    enteteSousPageTitre: { fontSize: 17, fontWeight: '800', color: c.texte },`
);

fs.writeFileSync(p, s);
console.log('ok');
