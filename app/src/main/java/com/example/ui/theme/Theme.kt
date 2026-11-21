package com.example.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.example.data.model.PlatformConfig
import com.example.data.model.resolvedForMidad

private val LightColorScheme = lightColorScheme(
    primary = MidadNavyDeep,
    onPrimary = MidadWhite,
    primaryContainer = MidadTurquoiseContainer,
    onPrimaryContainer = MidadNavyDeep,
    secondary = MidadTurquoise,
    onSecondary = MidadWhite,
    secondaryContainer = MidadGoldContainer,
    onSecondaryContainer = MidadGoldOnContainer,
    tertiary = MidadGold,
    onTertiary = MidadNavyDeep,
    tertiaryContainer = MidadIvory,
    onTertiaryContainer = MidadNavyDeep,
    background = MidadBackgroundLight,
    onBackground = MidadTextPrimaryLight,
    surface = MidadWhite,
    onSurface = MidadTextPrimaryLight,
    surfaceVariant = MidadSurfaceVariantLight,
    onSurfaceVariant = MidadTextSecondaryLight,
    outline = MidadBorderLight,
    outlineVariant = MidadIvory,
    error = MidadError,
    onError = MidadWhite,
    errorContainer = MidadErrorContainer,
    onErrorContainer = Color(0xFF7F1D1D)
)

private val DarkColorScheme = darkColorScheme(
    primary = MidadGoldLight,
    onPrimary = MidadNavyDeep,
    primaryContainer = MidadNavyPrimary,
    onPrimaryContainer = MidadIvory,
    secondary = MidadTurquoiseLight,
    onSecondary = MidadBackgroundDark,
    secondaryContainer = MidadSurfaceVariantDark,
    onSecondaryContainer = MidadTurquoiseContainer,
    tertiary = MidadGold,
    onTertiary = MidadNavyDeep,
    tertiaryContainer = MidadSurfaceVariantDark,
    onTertiaryContainer = MidadGoldLight,
    background = MidadBackgroundDark,
    onBackground = MidadTextPrimaryDark,
    surface = MidadSurfaceDark,
    onSurface = MidadTextPrimaryDark,
    surfaceVariant = MidadSurfaceVariantDark,
    onSurfaceVariant = MidadTextSecondaryDark,
    outline = MidadBorderDark,
    outlineVariant = MidadSurfaceDark,
    error = Color(0xFFF87171),
    onError = Color(0xFF450A0A),
    errorContainer = Color(0xFF7F1D1D),
    onErrorContainer = Color(0xFFFECACA)
)

val MidadShapes = Shapes(
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp)
)

val AbkShapes = MidadShapes

fun parseSafeHexColor(hex: String?, fallback: Color): Color {
    val clean = hex?.trim().orEmpty()
    if (!clean.startsWith("#") || (clean.length != 7 && clean.length != 9)) return fallback
    return runCatching {
        Color(android.graphics.Color.parseColor(clean))
    }.getOrDefault(fallback)
}

@Composable
fun MidadTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    platformConfig: PlatformConfig? = null,
    content: @Composable () -> Unit
) {
    val resolvedConfig = remember(platformConfig) {
        platformConfig?.resolvedForMidad()
    }
    val dynamicPrimary = remember(resolvedConfig?.primaryColorHex) {
        parseSafeHexColor(resolvedConfig?.primaryColorHex, MidadNavyDeep)
    }
    val dynamicSecondary = remember(resolvedConfig?.secondaryColorHex) {
        parseSafeHexColor(resolvedConfig?.secondaryColorHex, MidadTurquoise)
    }
    val dynamicAccent = remember(resolvedConfig?.accentColorHex) {
        parseSafeHexColor(resolvedConfig?.accentColorHex, MidadGold)
    }

    val colorScheme = if (darkTheme) {
        DarkColorScheme.copy(
            primary = MidadTurquoiseLight,
            secondary = dynamicAccent,
            tertiary = MidadGoldLight,
            primaryContainer = dynamicPrimary
        )
    } else {
        LightColorScheme.copy(
            primary = dynamicPrimary,
            secondary = dynamicSecondary,
            tertiary = dynamicAccent,
            onPrimaryContainer = dynamicPrimary
        )
    }

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = MidadTypography,
            shapes = MidadShapes,
            content = content
        )
    }
}

@Composable
fun ABKTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    platformConfig: PlatformConfig? = null,
    content: @Composable () -> Unit
) = MidadTheme(
    darkTheme = darkTheme,
    platformConfig = platformConfig,
    content = content
)
