package ru.vsmske.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/*
 * Material You: вместо стекла — тональные поверхности Material 3 (без теней и рамок).
 * Карточка — «заполненная» (surfaceContainerLow), скругление 24 dp, как у карточек в приложениях Google.
 */
@Composable
fun Modifier.glassCard(radius: Dp = 24.dp): Modifier =
    this.clip(RoundedCornerShape(radius)).background(MaterialTheme.colorScheme.surfaceContainerLow)

/** Фон экрана — просто поверхность темы */
@Composable
fun Orbs(modifier: Modifier = Modifier) = Box(modifier.fillMaxSize().background(MaterialTheme.colorScheme.surface))
