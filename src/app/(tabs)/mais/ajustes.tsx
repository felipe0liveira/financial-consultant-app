import { Alert, ScrollView, Text, View } from "react-native";
import { useAuth } from "../../../auth/AuthProvider";
import { displayName } from "../../../auth/session";
import { fonts } from "../../../theme/tokens";
import { useTheme } from "../../../theme/ThemeProvider";
import { Avatar } from "../../../ui/Avatar";
import { Button } from "../../../ui/Button";
import { ThemeSegmented } from "../../../ui/ThemeSegmented";

export default function Ajustes() {
  const { colors } = useTheme();
  const { session, signOut } = useAuth();
  const profile = session?.profile ?? { name: "", email: "", picture: null };
  const name = displayName(profile);

  function confirmSignOut() {
    Alert.alert(
      "Sair da conta?",
      "Você precisará entrar novamente para acessar suas contas.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sair", style: "destructive", onPress: () => void signOut() },
      ]
    );
  }

  const section = { backgroundColor: colors.card, borderRadius: 18, padding: 16, gap: 12 };
  const heading = { fontFamily: fonts.displaySemi, fontSize: 18, color: colors.ink };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={section}>
        <Text accessibilityRole="header" style={heading}>Perfil</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={name} uri={profile.picture} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: "600", color: colors.ink }}>{name}</Text>
            {profile.email ? <Text style={{ color: colors.inkSoft }}>{profile.email}</Text> : null}
          </View>
        </View>
        <Button label="Sair" variant="danger" onPress={confirmSignOut} />
      </View>
      <View style={section}>
        <Text accessibilityRole="header" style={heading}>Aparência</Text>
        <ThemeSegmented />
      </View>
    </ScrollView>
  );
}
