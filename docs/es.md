# Veolia — consumo de agua

Esta integración lee su consumo de agua desde su **área de cliente de Veolia**
(eau.veolia.fr) y lo lleva a Gladys: un dispositivo «contador de agua», un
widget para el panel y tarjetas para sus escenas.

## Qué necesita

- Un contador de agua con **telelectura** (télérelève): envía su consumo a
  Veolia todos los días. Sin él, Veolia solo tiene una lectura al año.
- Un **área de cliente de Veolia** con un e-mail y una contraseña. Compruebe que
  la web de Veolia muestra su consumo día a día.
- Gladys **5.3 o posterior**.

¿Veolia abastece su municipio? En la pestaña **Configuración**, use el botón
**Comprobar mi municipio** con su código postal. Por ejemplo, Metz (57000)
responde «Compatible, portal eau.veolia.fr».

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. Introduzca el **e-mail** y la **contraseña** de su área de cliente.
3. **Área de cliente**: deje `eau.veolia.fr`, salvo que _Comprobar mi
   municipio_ indique otro portal (Eau de Toulouse Métropole, Vendée Eau,
   C Mon O, Nantes Métropole…).
4. Ajustes opcionales:
   - **Intervalo de actualización** (6 h por defecto): Veolia publica una
     lectura al día, un intervalo corto no aporta nada;
   - **Umbral de consumo alto** (L/día): 0 = desactivado. A partir de él, se
     lanza el activador _Consumo de agua alto_;
   - **Lectura ausente tras** (3 días por defecto): plazo antes del activador
     _Lectura de agua atrasada_.
5. Pulse **Guardar configuración** y luego **Probar la conexión**: la respuesta muestra su contador y su
   última lectura.
6. Abra la pestaña **Descubrir** y añada el contador de agua con **Añadir a
   Gladys**.

Una vez añadido el dispositivo, el historial conocido (el mes actual y el
anterior) se envía a Gladys, **fechado en el día de cada lectura**.

Después, la integración recupera de Veolia los **24 meses anteriores**, también
fechados en su día, para que los gráficos de Gladys puedan mostrar los años
pasados. La importación se ejecuta en segundo plano, un mes cada 20 segundos
(unos 8 minutos). No hay que proporcionar ningún archivo: Veolia conserva el
historial. Si Gladys borra los estados antiguos (el ajuste **Conservar el
historial de estados de los dispositivos** en **Configuración → Sistema**), elija
al menos 2 años para conservarlos.

## El dispositivo «Contador de agua»

| Valor                    | Unidad | Significado                                     |
| ------------------------ | ------ | ----------------------------------------------- |
| Index                    | m³     | Índice del contador en la última lectura        |
| Consommation journalière | L      | Litros consumidos cada día, guardados en su día |
| Consommation du mois     | m³     | Total del mes en curso                          |
| Consommation de l'année  | m³     | Total del año natural en curso                  |

La tarjeta del dispositivo lleva la insignia **Nube** mientras el portal de
Veolia responde, **Inaccesible** cuando no responde, con un punto naranja cuando
no ha llegado ninguna lectura en el plazo «Lectura ausente tras». No hay modo
local: los datos solo existen en Veolia.

Conviene saberlo: Veolia publica una lectura con **1 a 3 días de retraso**. Es
normal no ver el consumo de ayer.

## Panel

Añada el widget **Consumo de agua** (**Panel → Editar → Nuevo widget**): último día, mes, año, índice, un gráfico
diario (7, 14 o 30 días, a elegir en el widget), la fecha y la fiabilidad de la
última lectura (medida o estimada) y un botón **Actualizar**. Con varios
contadores, elija uno en los ajustes del widget.

El widget **Agua: comparación anual** muestra el consumo de cada mes de los
últimos 3 años uno al lado del otro, el total de cada año y la variación
respecto al año anterior en el mismo periodo (de enero al último mes completo).
Sus cifras vienen directamente de Veolia: funciona aunque Gladys no haya
conservado el historial.

## Escenas

La integración añade sus tarjetas al editor de escenas, en **Integraciones**
(**Activador de integración** y **Acción de integración**).

Activadores:

- **Nueva lectura de agua** — Veolia ha publicado un nuevo día. Variables:
  `{{triggerEvent.data.date}}`, `{{triggerEvent.data.liters}}`,
  `{{triggerEvent.data.index_m3}}`.
- **Consumo de agua alto** — un día ha alcanzado el umbral que ha fijado
  (posible fuga). Variables: `date`, `liters`, `threshold_liters`.
- **Lectura de agua atrasada** — ninguna lectura nueva desde el número de días
  que ha fijado (contador o portal caído). Variables: `last_date`, `days`.

Acciones:

- **Actualizar el consumo de agua** — lee Veolia ahora y devuelve la lectura más
  reciente (`date`, `liters`, `index_m3`).
- **Obtener el consumo de agua** — devuelve el consumo de un periodo (último
  día leído, este mes, el mes pasado, este año) en litros y m³, para un mensaje
  o una condición.

Ejemplo: «cada día 1 del mes a las 9:00, obtener el consumo del mes pasado y
enviarme: _El mes pasado: {{…cubic_meters}} m³_».

## Solución de problemas

- **«Veolia ha rechazado el e-mail o la contraseña»**: inicie sesión en la web
  de Veolia con las mismas credenciales. Si Veolia le pide una contraseña nueva,
  cámbiela allí y luego actualice Gladys.
- **«WAF block»** en el estado: Veolia (a través de AWS) bloquea algunas
  direcciones de servidor (proveedores de alojamiento, VPN). Desde una conexión
  doméstica normal no debería ocurrir.
- **Ningún consumo diario, valores vacíos**: probablemente su contador no
  tiene telelectura. **Probar la conexión** muestra el modo de lectura que da
  Veolia (`RADIORELEVE`, `MANUAL`…), y los logs también en cada actualización.
  En la web de Veolia: «Type de relève» de su contrato. Solo los contadores con
  telelectura tienen lecturas diarias. Si el contador tiene telelectura o el
  modo es «no indicado», el mensaje también cuenta los registros enviados por
  Veolia: cópielo en una issue de GitHub.
- **Municipio «todavía no compatible»**: su municipio tiene su propio portal de
  Veolia. Abra una issue en el repositorio de GitHub con la dirección del
  portal.

## Sus datos

- Sus credenciales se quedan en la configuración de Gladys. Solo se envían a
  Veolia (su servicio de inicio de sesión AWS Cognito) y nunca se escriben en
  los registros.
- La integración solo lee su consumo. No cambia nada en su cuenta de Veolia.
- Veolia no ofrece ninguna API oficial para estos datos: la integración hace lo
  mismo que la web. Si Veolia cambia su web, puede dejar de funcionar hasta una
  actualización.
